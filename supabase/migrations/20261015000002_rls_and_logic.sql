-- OXL MVP — row-level security, matching engine and risk report

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.countries         enable row level security;
alter table public.commodities       enable row level security;
alter table public.organisations     enable row level security;
alter table public.profiles          enable row level security;
alter table public.verifications     enable row level security;
alter table public.documents         enable row level security;
alter table public.offers            enable row level security;
alter table public.requests          enable row level security;
alter table public.interests         enable row level security;
alter table public.finance_requests  enable row level security;
alter table public.report_shares     enable row level security;

-- Reference data: readable by everyone signed in
create policy countries_read   on public.countries   for select to authenticated using (true);
create policy commodities_read on public.commodities for select to authenticated using (true);

-- Organisations: a signed-in directory (name, country, tier are the point of the platform)
create policy orgs_read   on public.organisations for select to authenticated using (true);
create policy orgs_update on public.organisations for update to authenticated
  using (id = public.my_org_id() or public.is_oxl_admin())
  with check (id = public.my_org_id() or public.is_oxl_admin());
-- inserts go through create_my_organisation(); admins can insert directly
create policy orgs_admin_insert on public.organisations for insert to authenticated with check (public.is_oxl_admin());

-- Profiles: see yourself and colleagues in your org; admins see all
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or org_id = public.my_org_id() or public.is_oxl_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_oxl_admin()) with check (id = auth.uid() or public.is_oxl_admin());

-- Verification log: own org, admins, and anyone allowed to see the risk report
create policy verifications_read on public.verifications for select to authenticated
  using (public.can_view_report(org_id));
-- writes only via set_verification_tier() / create_my_organisation() (security definer)

-- Documents: own org uploads and reads; admins review; financiers read when the report is shared
create policy documents_read on public.documents for select to authenticated
  using (public.can_view_report(org_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (org_id = public.my_org_id() and review_status = 'pending');
create policy documents_admin_update on public.documents for update to authenticated
  using (public.is_oxl_admin()) with check (public.is_oxl_admin());
create policy documents_delete_own on public.documents for delete to authenticated
  using (org_id = public.my_org_id() and review_status = 'pending');

-- Offers (exporters) and requests (importers): open listings visible to all signed-in users
create policy offers_read on public.offers for select to authenticated
  using (status = 'open' or org_id = public.my_org_id() or public.is_oxl_admin());
create policy offers_write on public.offers for all to authenticated
  using (org_id = public.my_org_id())
  with check (org_id = public.my_org_id() and public.my_org_role() = 'exporter');

create policy requests_read on public.requests for select to authenticated
  using (status = 'open' or org_id = public.my_org_id() or public.is_oxl_admin());
create policy requests_write on public.requests for all to authenticated
  using (org_id = public.my_org_id())
  with check (org_id = public.my_org_id() and public.my_org_role() = 'importer');

-- Interests: visible to both sides of the pair
create policy interests_read on public.interests for select to authenticated
  using (
    public.is_oxl_admin()
    or exists (select 1 from public.offers o   where o.id = offer_id   and o.org_id = public.my_org_id())
    or exists (select 1 from public.requests r where r.id = request_id and r.org_id = public.my_org_id())
  );
create policy interests_insert on public.interests for insert to authenticated
  with check (
    initiated_by = public.my_org_id() and status = 'proposed' and (
      exists (select 1 from public.offers o   where o.id = offer_id   and o.org_id = public.my_org_id())
      or exists (select 1 from public.requests r where r.id = request_id and r.org_id = public.my_org_id())
    )
  );
create policy interests_update on public.interests for update to authenticated
  using (
    exists (select 1 from public.offers o   where o.id = offer_id   and o.org_id = public.my_org_id())
    or exists (select 1 from public.requests r where r.id = request_id and r.org_id = public.my_org_id())
    or public.is_oxl_admin()
  );

-- Finance requests: owner writes; financiers and admins read open ones
create policy finance_read on public.finance_requests for select to authenticated
  using (org_id = public.my_org_id() or public.is_oxl_admin()
         or (status = 'open' and public.my_org_role() = 'financier'));
create policy finance_write on public.finance_requests for all to authenticated
  using (org_id = public.my_org_id())
  with check (org_id = public.my_org_id() and public.my_org_role() in ('exporter','importer'));

-- Report shares: the owner grants and revokes; the financier can see what was shared with it
create policy shares_read on public.report_shares for select to authenticated
  using (org_id = public.my_org_id() or shared_with_org_id = public.my_org_id() or public.is_oxl_admin());
create policy shares_insert on public.report_shares for insert to authenticated
  with check (org_id = public.my_org_id()
              and exists (select 1 from public.organisations f where f.id = shared_with_org_id and f.role = 'financier'));
create policy shares_delete on public.report_shares for delete to authenticated
  using (org_id = public.my_org_id());

-- ─────────────────────────────────────────────────────────────
-- Matching engine (explainable, rules-based; weights total 100)
--   grade 20 · quantity 25 · price 20 · incoterm 10 · verification 15 · corridor 10
-- ─────────────────────────────────────────────────────────────
create or replace function public.tier_rank(t public.verification_tier) returns int
language sql immutable as $$
  select array_position(enum_range(null::public.verification_tier), t) - 1
$$;

create or replace function public.score_pair(o public.offers, r public.requests)
returns table (score int, factors jsonb)
language plpgsql stable set search_path = public as $$
declare
  f jsonb := '[]'::jsonb;
  pts int; total int := 0;
  cov numeric;
  v_tier public.verification_tier;
  o_african boolean; d_african boolean;
begin
  -- Grade (20)
  if o.grade is null or r.grade is null then
    pts := 10; f := f || jsonb_build_object('factor','Grade','points',pts,'max',20,'detail','Grade not specified on one side');
  elsif lower(trim(o.grade)) = lower(trim(r.grade)) then
    pts := 20; f := f || jsonb_build_object('factor','Grade','points',pts,'max',20,'detail','Same grade: ' || o.grade);
  else
    pts := 0;  f := f || jsonb_build_object('factor','Grade','points',pts,'max',20,'detail','Offer is ' || o.grade || ', buyer wants ' || r.grade);
  end if;
  total := total + pts;

  -- Quantity (25)
  cov := least(o.quantity_tonnes / r.quantity_tonnes, 1);
  pts := round(25 * cov);
  f := f || jsonb_build_object('factor','Quantity','points',pts,'max',25,
        'detail', trim_scale(o.quantity_tonnes) || ' t offered vs ' || trim_scale(r.quantity_tonnes) || ' t needed (' || round(cov * 100) || '% covered)');
  total := total + pts;

  -- Price (20)
  if o.price_usd_per_tonne is null or r.target_price_usd_per_tonne is null then
    pts := 10; f := f || jsonb_build_object('factor','Price','points',pts,'max',20,'detail','Price open to negotiation');
  elsif o.price_usd_per_tonne <= r.target_price_usd_per_tonne then
    pts := 20; f := f || jsonb_build_object('factor','Price','points',pts,'max',20,
          'detail','$' || trim_scale(o.price_usd_per_tonne) || '/t is within the $' || trim_scale(r.target_price_usd_per_tonne) || '/t target');
  elsif o.price_usd_per_tonne <= r.target_price_usd_per_tonne * 1.10 then
    pts := 10; f := f || jsonb_build_object('factor','Price','points',pts,'max',20,
          'detail','$' || trim_scale(o.price_usd_per_tonne) || '/t is within 10% of the $' || trim_scale(r.target_price_usd_per_tonne) || '/t target');
  else
    pts := 0;  f := f || jsonb_build_object('factor','Price','points',pts,'max',20,
          'detail','$' || trim_scale(o.price_usd_per_tonne) || '/t is more than 10% above the $' || trim_scale(r.target_price_usd_per_tonne) || '/t target');
  end if;
  total := total + pts;

  -- Incoterm (10)
  if o.incoterm is null or r.incoterm is null then
    pts := 5;  f := f || jsonb_build_object('factor','Incoterm','points',pts,'max',10,'detail','Incoterm not specified on one side');
  elsif o.incoterm = r.incoterm then
    pts := 10; f := f || jsonb_build_object('factor','Incoterm','points',pts,'max',10,'detail','Both on ' || o.incoterm);
  else
    pts := 0;  f := f || jsonb_build_object('factor','Incoterm','points',pts,'max',10,'detail','Offer ' || o.incoterm || ', buyer wants ' || r.incoterm);
  end if;
  total := total + pts;

  -- Seller verification (15)
  select verification_tier into v_tier from public.organisations where id = o.org_id;
  pts := 5 * public.tier_rank(v_tier);
  f := f || jsonb_build_object('factor','Seller verification','points',pts,'max',15,'detail','Tier: ' || replace(v_tier::text, '_', ' '));
  total := total + pts;

  -- Corridor (10)
  select is_african into o_african from public.countries where code = o.origin_country;
  select is_african into d_african from public.countries where code = r.destination_country;
  if o.origin_country = r.destination_country then
    pts := 10; f := f || jsonb_build_object('factor','Corridor','points',pts,'max',10,'detail','Domestic trade');
  elsif o_african and d_african then
    pts := 10; f := f || jsonb_build_object('factor','Corridor','points',pts,'max',10,
          'detail', o.origin_country || ' → ' || r.destination_country || ': intra-African, may qualify for AfCFTA preference (check rules of origin)');
  else
    pts := 5;  f := f || jsonb_build_object('factor','Corridor','points',pts,'max',10,
          'detail', o.origin_country || ' → ' || r.destination_country || ': export outside Africa');
  end if;
  total := total + pts;

  return query select total, f;
end $$;

-- Offers that fit an importer's request, best first
create or replace function public.match_request(p_request_id uuid)
returns table (offer_id uuid, org_id uuid, org_name text, org_country char(2),
               verification_tier public.verification_tier, is_demo boolean, score int, factors jsonb)
language sql stable set search_path = public as $$
  select o.id, org.id, org.name, org.country, org.verification_tier, org.is_demo, s.score, s.factors
  from public.requests r
  join public.offers o on o.hs_code = r.hs_code and o.status = 'open' and o.org_id <> r.org_id
  join public.organisations org on org.id = o.org_id
  cross join lateral public.score_pair(o, r) s
  where r.id = p_request_id
  order by s.score desc, o.created_at desc
  limit 25
$$;

-- Requests that fit an exporter's offer, best first
create or replace function public.match_offer(p_offer_id uuid)
returns table (request_id uuid, org_id uuid, org_name text, org_country char(2),
               verification_tier public.verification_tier, is_demo boolean, score int, factors jsonb)
language sql stable set search_path = public as $$
  select r.id, org.id, org.name, org.country, org.verification_tier, org.is_demo, s.score, s.factors
  from public.offers o
  join public.requests r on r.hs_code = o.hs_code and r.status = 'open' and r.org_id <> o.org_id
  join public.organisations org on org.id = r.org_id
  cross join lateral public.score_pair(o, r) s
  where o.id = p_offer_id
  order by s.score desc, r.created_at desc
  limit 25
$$;

-- ─────────────────────────────────────────────────────────────
-- Counterparty risk report (rules-based scorecard; weights total 100)
--   verification 35 · key documents 20 · years trading 15 · completed trades 15 · profile 15
-- Information for due diligence only — not a credit decision.
-- ─────────────────────────────────────────────────────────────
create or replace function public.risk_report(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  org public.organisations;
  f jsonb := '[]'::jsonb;
  pts int; total int := 0;
  n_docs int; n_trades int; years int; n_profile int;
  band text;
begin
  if not public.can_view_report(p_org_id) then
    raise exception 'This report has not been shared with your organisation';
  end if;
  select * into org from public.organisations where id = p_org_id;
  if not found then raise exception 'Organisation not found'; end if;

  -- Verification tier (35)
  pts := round(35 * public.tier_rank(org.verification_tier) / 3.0);
  f := f || jsonb_build_object('factor','Verification tier','points',pts,'max',35,
        'detail', initcap(replace(org.verification_tier::text, '_', ' ')));
  total := total + pts;

  -- Approved key documents (20 = 5 each)
  select count(distinct doc_type) into n_docs from public.documents
  where org_id = p_org_id and review_status = 'approved'
    and doc_type in ('business_registration','export_licence','tax_certificate','quality_certificate');
  pts := 5 * n_docs;
  f := f || jsonb_build_object('factor','Key documents approved','points',pts,'max',20,
        'detail', n_docs || ' of 4 (registration, export licence, tax, quality)');
  total := total + pts;

  -- Years trading (15)
  years := case when org.year_established is null then 0
                else greatest(extract(year from now())::int - org.year_established, 0) end;
  pts := round(15 * least(years, 10) / 10.0);
  f := f || jsonb_build_object('factor','Years trading','points',pts,'max',15,
        'detail', case when org.year_established is null then 'Not stated' else years || ' years (since ' || org.year_established || ')' end);
  total := total + pts;

  -- Completed trades on OXL (15 = 3 each, up to 5)
  select count(*) into n_trades from public.interests i
  where i.status = 'completed' and (
    exists (select 1 from public.offers o where o.id = i.offer_id and o.org_id = p_org_id)
    or exists (select 1 from public.requests r where r.id = i.request_id and r.org_id = p_org_id));
  pts := 3 * least(n_trades, 5);
  f := f || jsonb_build_object('factor','Completed trades on OXL','points',pts,'max',15, 'detail', n_trades || ' completed');
  total := total + pts;

  -- Profile completeness (15)
  n_profile := (org.registration_no is not null)::int + (org.city is not null)::int
             + (coalesce(length(org.description), 0) > 30)::int + (cardinality(org.hs_codes) > 0)::int
             + (org.year_established is not null)::int;
  pts := 3 * n_profile;
  f := f || jsonb_build_object('factor','Profile completeness','points',pts,'max',15, 'detail', n_profile || ' of 5 fields');
  total := total + pts;

  band := case when total >= 75 then 'A' when total >= 55 then 'B' when total >= 35 then 'C' else 'D' end;

  return jsonb_build_object(
    'org_id', org.id, 'org_name', org.name, 'country', org.country, 'role', org.role,
    'is_demo', org.is_demo, 'score', total, 'band', band, 'factors', f,
    'generated_at', now(),
    'disclaimer', 'Due-diligence information from OXL records. Not a credit rating or lending decision.'
  );
end $$;

grant execute on function public.match_request(uuid), public.match_offer(uuid), public.risk_report(uuid),
  public.create_my_organisation(text, public.org_role, char, text, text, int, text, text[], text, text),
  public.set_verification_tier(uuid, public.verification_tier, text, text)
  to authenticated;
