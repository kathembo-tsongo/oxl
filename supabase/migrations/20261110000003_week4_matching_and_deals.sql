-- OXL MVP — Week 4 (M4): timing-aware matching, deals tracked to delivery, ratings in the trust report.
-- Conceptual Design §5: Stage 1 must-pass checks, Stage 2 ranking out of 100
--   timing 20 · reliability 15 · quality and certificates 15 · landed price 15 · quantity 15 · distance 10 · terms 10

-- ─────────────────────────────────────────────────────────────
-- 1. Helpers: distance and route estimate
-- ─────────────────────────────────────────────────────────────
create or replace function public.distance_km(p_from uuid, p_to uuid) returns int
language sql stable set search_path = public as $$
  select round(6371 * 2 * asin(sqrt(
           power(sin(radians((b.lat - a.lat) / 2)), 2)
         + cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians((b.lon - a.lon) / 2)), 2))))::int
  from public.locations a, public.locations b
  where a.id = p_from and b.id = p_to and a.lat is not null and b.lat is not null
$$;

-- Fastest route on record from the seller's collection point to the buyer's delivery point.
-- Falls back to the fastest route between the same two countries, labelled as approximate.
create or replace function public.route_estimate(p_from uuid, p_to uuid, p_from_country char(2), p_to_country char(2), p_mode text)
returns table (route_id uuid, mode text, total_days int, cost_usd_per_tonne numeric, exact boolean, label text)
language sql stable set search_path = public as $$
  (select r.id, r.mode, r.total_days, r.cost_usd_per_tonne, true,
          a.name || ' → ' || b.name || ' by ' || r.mode
   from public.routes r join public.locations a on a.id = r.from_location_id join public.locations b on b.id = r.to_location_id
   where r.from_location_id = p_from and r.to_location_id = p_to and (coalesce(p_mode, 'any') = 'any' or r.mode = p_mode)
   order by r.total_days limit 1)
  union all
  (select r.id, r.mode, r.total_days, r.cost_usd_per_tonne, false,
          'similar route ' || a.name || ' → ' || b.name || ' by ' || r.mode
   from public.routes r join public.locations a on a.id = r.from_location_id join public.locations b on b.id = r.to_location_id
   where a.country = coalesce((select country from public.locations where id = p_from), p_from_country)
     and b.country = coalesce((select country from public.locations where id = p_to), p_to_country)
     and (coalesce(p_mode, 'any') = 'any' or r.mode = p_mode)
   order by r.total_days limit 1)
  limit 1
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Evaluate one offer against one request: checks, factors, score, estimated arrival
-- ─────────────────────────────────────────────────────────────
create or replace function public.evaluate_pair(o public.offers, r public.requests) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_margin int := coalesce((select (value #>> '{}')::int from public.settings where key = 'safety_margin_days'), 10);
  v_ready date := greatest(coalesce(o.available_from, current_date), current_date);
  seller public.organisations; buyer public.organisations;
  rt record; v_days int; v_cost numeric; v_label text; v_arrival date; v_slack int;
  v_dist int; v_supply numeric; v_missing text[]; v_pref_have int; v_pref_total int;
  v_landed numeric; v_n_rated int; v_n_ontime int;
  checks jsonb := '[]'::jsonb; f jsonb := '[]'::jsonb; ok boolean; passed boolean := true;
  pts int; total int := 0;
  fmt constant text := 'DD Mon YYYY';
begin
  select * into seller from public.organisations where id = o.org_id;
  select * into buyer  from public.organisations where id = r.org_id;

  -- Route and estimated arrival
  select * into rt from public.route_estimate(o.collection_location_id, r.delivery_location_id, o.origin_country, r.destination_country, r.transport_mode);
  if rt.route_id is not null then
    v_days := rt.total_days; v_cost := rt.cost_usd_per_tonne; v_label := rt.label;
  elsif o.origin_country = r.destination_country then
    v_days := 3; v_label := 'domestic delivery, about 3 days';
  end if;
  if v_days is not null then v_arrival := v_ready + v_days; end if;
  v_dist := public.distance_km(o.collection_location_id, r.delivery_location_id);
  if v_dist is null and rt.route_id is not null then
    select public.distance_km(x.from_location_id, x.to_location_id) into v_dist from public.routes x where x.id = rt.route_id;
  end if;

  -- ── Stage 1: must-pass checks ──
  ok := o.grade is null or r.grade is null or lower(trim(o.grade)) = lower(trim(r.grade));
  checks := checks || jsonb_build_object('check', 'Right product', 'passed', ok, 'detail',
    case when ok then 'Same commodity' || coalesce(' and grade (' || coalesce(o.grade, r.grade) || ')', '')
         else 'Offer is ' || o.grade || ', buyer wants ' || r.grade end);
  passed := passed and ok;

  if r.needed_by is null then
    ok := true; checks := checks || jsonb_build_object('check', 'Ready in time', 'passed', true, 'detail', 'Buyer has not set a deadline');
  elsif v_arrival is null then
    ok := true; checks := checks || jsonb_build_object('check', 'Ready in time', 'passed', true, 'detail', 'Delivery time could not be estimated: no route on record');
  else
    v_slack := (r.needed_by - v_arrival);
    ok := v_slack >= v_margin;
    checks := checks || jsonb_build_object('check', 'Ready in time', 'passed', ok, 'detail',
      case when ok then 'Arrives about ' || to_char(v_arrival, fmt) || ', ' || v_slack || ' days before the deadline'
           else 'Would arrive about ' || to_char(v_arrival, fmt) || '; buyer needs it by ' || to_char(r.needed_by, fmt)
                || ' with a ' || v_margin || '-day safety margin' end);
  end if;
  passed := passed and ok;

  v_supply := greatest(o.quantity_tonnes, coalesce(o.monthly_capacity_tonnes, 0));
  ok := r.min_quantity_tonnes is null or v_supply >= r.min_quantity_tonnes;
  checks := checks || jsonb_build_object('check', 'Enough quantity', 'passed', ok, 'detail',
    case when r.min_quantity_tonnes is null then 'No minimum order set'
         when ok then trim_scale(v_supply) || ' t available, minimum order ' || trim_scale(r.min_quantity_tonnes) || ' t'
         else 'Only ' || trim_scale(v_supply) || ' t available; minimum order is ' || trim_scale(r.min_quantity_tonnes) || ' t' end);
  passed := passed and ok;

  select array_agg(d.certificate order by d.certificate) into v_missing
  from public.destination_requirements d
  where d.destination_country = r.destination_country and d.is_mandatory
    and (d.hs_code is null or d.hs_code = o.hs_code)
    and not (d.certificate = any (o.certificates));
  ok := v_missing is null;
  checks := checks || jsonb_build_object('check', 'Allowed at destination', 'passed', ok, 'detail',
    case when ok then 'Holds the certificates ' || r.destination_country || ' requires'
         else 'Missing certificate required by ' || r.destination_country || ': ' || replace(array_to_string(v_missing, ', '), '_', ' ') end);
  passed := passed and ok;

  ok := not seller.is_suspended and not buyer.is_suspended
        and not exists (select 1 from public.sanctions_entries s where lower(trim(s.name)) in (lower(trim(seller.name)), lower(trim(buyer.name))));
  checks := checks || jsonb_build_object('check', 'Safe to connect', 'passed', ok, 'detail',
    case when ok then 'Active, not suspended, passed sanctions screening' else 'Not eligible for matching' end);
  passed := passed and ok;

  -- ── Stage 2: ranking ──
  -- Delivery timing (20)
  if r.needed_by is null then pts := 14; v_label := coalesce(v_label, 'no route on record');
    f := f || jsonb_build_object('factor', 'Delivery timing', 'points', pts, 'max', 20, 'detail', 'No deadline set' || coalesce('; estimated arrival ' || to_char(v_arrival, fmt), ''));
  elsif v_arrival is null then pts := 8;
    f := f || jsonb_build_object('factor', 'Delivery timing', 'points', pts, 'max', 20, 'detail', 'Arrival not estimated: no route on record');
  else pts := greatest(0, least(20, 10 + round(10 * (v_slack - v_margin) / 20.0)::int));
    f := f || jsonb_build_object('factor', 'Delivery timing', 'points', pts, 'max', 20, 'detail',
          'Ready ' || to_char(v_ready, fmt) || ' + ' || v_days || ' days (' || v_label || ') = about ' || to_char(v_arrival, fmt) || '; ' || v_slack || ' days to spare');
  end if;
  total := total + pts;

  -- Seller reliability (15): trust level (up to 9) + on-time delivery record (up to 6)
  select count(*), count(*) filter (where on_time) into v_n_rated, v_n_ontime from public.ratings where rated_org_id = o.org_id;
  pts := 3 * public.tier_rank(seller.verification_tier)
       + case when v_n_rated = 0 then 3 else round(6.0 * v_n_ontime / v_n_rated)::int end;
  f := f || jsonb_build_object('factor', 'Seller reliability', 'points', pts, 'max', 15, 'detail',
        initcap(replace(seller.verification_tier::text, '_', ' ')) || '; '
        || case when v_n_rated = 0 then 'no delivery history yet' else v_n_ontime || ' of ' || v_n_rated || ' rated deliveries on time' end);
  total := total + pts;

  -- Quality and certificates (15): grade (10) + certificates the buyer prefers (5)
  pts := case when o.grade is null or r.grade is null then 6 when lower(trim(o.grade)) = lower(trim(r.grade)) then 10 else 0 end;
  v_pref_total := coalesce(cardinality(r.preferred_certificates), 0);
  select count(*) into v_pref_have from unnest(r.preferred_certificates) c where c = any (o.certificates);
  pts := pts + case when v_pref_total = 0 then 5 else round(5.0 * v_pref_have / v_pref_total)::int end;
  f := f || jsonb_build_object('factor', 'Quality and certificates', 'points', pts, 'max', 15, 'detail',
        case when o.grade is null or r.grade is null then 'Grade not specified on one side' else 'Same grade (' || o.grade || ')' end
        || case when v_pref_total = 0 then '' else '; holds ' || v_pref_have || ' of ' || v_pref_total || ' preferred certificates' end);
  total := total + pts;

  -- Landed price (15): price + transport (unless the price already includes freight), against the buyer's target
  if o.price_usd_per_tonne is null or r.target_price_usd_per_tonne is null then
    pts := 7; f := f || jsonb_build_object('factor', 'Landed price', 'points', pts, 'max', 15, 'detail', 'Price open to negotiation');
  else
    v_landed := o.price_usd_per_tonne + case when o.incoterm in ('CFR', 'CIF', 'DAP', 'DDP') then 0 else coalesce(v_cost, 0) end;
    pts := case when v_landed <= r.target_price_usd_per_tonne then 15
                when v_landed <= r.target_price_usd_per_tonne * 1.10 then 8 else 2 end;
    f := f || jsonb_build_object('factor', 'Landed price', 'points', pts, 'max', 15, 'detail',
          'About $' || trim_scale(round(v_landed)) || '/t landed'
          || case when o.incoterm in ('CFR', 'CIF', 'DAP', 'DDP') then ' (' || o.incoterm || ', freight included)'
                  when v_cost is not null then ' ($' || trim_scale(o.price_usd_per_tonne) || ' + $' || trim_scale(v_cost) || ' transport)'
                  else ' (transport cost unknown)' end
          || ' vs $' || trim_scale(r.target_price_usd_per_tonne) || '/t target'
          || case when (select is_african from public.countries where code = o.origin_country)
                   and (select is_african from public.countries where code = r.destination_country)
                   and o.origin_country <> r.destination_country
                  then '; may qualify for AfCFTA reduced duty' else '' end);
  end if;
  total := total + pts;

  -- Quantity fit (15)
  pts := round(15 * least(v_supply / r.quantity_tonnes, 1))::int;
  f := f || jsonb_build_object('factor', 'Quantity fit', 'points', pts, 'max', 15, 'detail',
        trim_scale(v_supply) || ' t available for ' || trim_scale(r.quantity_tonnes) || ' t needed (' || round(100 * least(v_supply / r.quantity_tonnes, 1)) || '%)');
  total := total + pts;

  -- Distance and transport (10)
  pts := case when o.origin_country = r.destination_country then 10 when v_dist is null then 5
              when v_dist <= 1000 then 10 when v_dist <= 3000 then 8 when v_dist <= 6000 then 6 else 4 end;
  f := f || jsonb_build_object('factor', 'Distance and transport', 'points', pts, 'max', 10, 'detail',
        case when o.origin_country = r.destination_country then 'Domestic' when v_dist is null then 'Distance unknown'
             else 'About ' || to_char(v_dist, 'FM999,999') || ' km in a straight line' end
        || coalesce('; ' || rt.mode || ' route on record', ''));
  total := total + pts;

  -- Terms fit (10)
  pts := case when o.incoterm is null or r.incoterm is null then 5 when o.incoterm = r.incoterm then 10 else 3 end;
  f := f || jsonb_build_object('factor', 'Terms fit', 'points', pts, 'max', 10, 'detail',
        case when o.incoterm is null or r.incoterm is null then 'Incoterm not specified on one side'
             when o.incoterm = r.incoterm then 'Both on ' || o.incoterm else 'Offer ' || o.incoterm || ', buyer wants ' || r.incoterm end);
  total := total + pts;

  return jsonb_build_object('passed', passed, 'checks', checks, 'score', total, 'factors', f,
    'est_arrival', v_arrival, 'route_label', v_label);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Matching: every candidate is returned with its checks; the app shows those that pass, ranked,
--    and summarises why the others were left out (without naming them)
-- ─────────────────────────────────────────────────────────────
create or replace function public.can_act_for(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org_id = public.my_org_id() or public.is_active_agent_of(p_org_id) or public.is_oxl_admin()
$$;

drop function if exists public.match_request(uuid);
create function public.match_request(p_request_id uuid)
returns table (offer_id uuid, org_id uuid, org_name text, org_country char(2), verification_tier public.verification_tier,
               is_demo boolean, score int, factors jsonb, passed boolean, checks jsonb, est_arrival date, route_label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.requests r where r.id = p_request_id and public.can_act_for(r.org_id)) then
    raise exception 'You can only match your own requests';
  end if;
  return query
  select o.id, org.id, org.name, org.country, org.verification_tier, org.is_demo,
         (e->>'score')::int, e->'factors', (e->>'passed')::boolean, e->'checks', (e->>'est_arrival')::date, e->>'route_label'
  from public.requests r
  join public.offers o on o.hs_code = r.hs_code and o.status = 'open' and o.org_id <> r.org_id
  join public.organisations org on org.id = o.org_id
  cross join lateral public.evaluate_pair(o, r) e
  where r.id = p_request_id
  order by (e->>'passed')::boolean desc, (e->>'score')::int desc, o.created_at desc
  limit 50;
end $$;

drop function if exists public.match_offer(uuid);
create function public.match_offer(p_offer_id uuid)
returns table (request_id uuid, org_id uuid, org_name text, org_country char(2), verification_tier public.verification_tier,
               is_demo boolean, score int, factors jsonb, passed boolean, checks jsonb, est_arrival date, route_label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.offers o where o.id = p_offer_id and public.can_act_for(o.org_id)) then
    raise exception 'You can only match your own offers';
  end if;
  return query
  select r.id, org.id, org.name, org.country, org.verification_tier, org.is_demo,
         (e->>'score')::int, e->'factors', (e->>'passed')::boolean, e->'checks', (e->>'est_arrival')::date, e->>'route_label'
  from public.offers o
  join public.requests r on r.hs_code = o.hs_code and r.status = 'open' and r.org_id <> o.org_id
  join public.organisations org on org.id = r.org_id
  cross join lateral public.evaluate_pair(o, r) e
  where o.id = p_offer_id
  order by (e->>'passed')::boolean desc, (e->>'score')::int desc, r.created_at desc
  limit 50;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Deals move step by step, only through this function (user story S5)
--    proposed → accepted → in_transit → delivered (buyer confirms) → completed (both confirm)
-- ─────────────────────────────────────────────────────────────
create or replace function public.advance_deal(p_deal_id uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  d public.interests; o public.offers; r public.requests;
  me uuid := public.my_org_id(); is_seller boolean; is_buyer boolean;
begin
  select * into d from public.interests where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  select * into o from public.offers where id = d.offer_id;
  select * into r from public.requests where id = d.request_id;
  is_seller := me = o.org_id; is_buyer := me = r.org_id;
  if not (is_seller or is_buyer or public.is_oxl_admin()) then raise exception 'Only the buyer or the seller can update this deal'; end if;

  if p_action in ('accept', 'decline') then
    if d.status <> 'proposed' then raise exception 'This deal is no longer waiting for a reply'; end if;
    if d.initiated_by = me then raise exception 'The other side must reply to your proposal'; end if;
    if p_action = 'accept' then
      update public.interests set status = 'accepted', updated_at = now(),
        estimated_arrival = (public.evaluate_pair(o, r)->>'est_arrival')::date where id = d.id;
    else
      update public.interests set status = 'declined', updated_at = now() where id = d.id;
    end if;
  elsif p_action = 'ship' then
    if not is_seller then raise exception 'Only the seller can mark goods as shipped'; end if;
    if d.status <> 'accepted' then raise exception 'Only an accepted deal can be shipped'; end if;
    update public.interests set status = 'in_transit', shipped_at = now(), updated_at = now() where id = d.id;
  elsif p_action = 'confirm_delivery' then
    if d.status not in ('in_transit', 'delivered') then raise exception 'Goods must be shipped before delivery is confirmed'; end if;
    if is_buyer then
      update public.interests set buyer_confirmed_delivery_at = coalesce(buyer_confirmed_delivery_at, now()), status = 'delivered', updated_at = now() where id = d.id;
    elsif is_seller then
      update public.interests set seller_confirmed_delivery_at = coalesce(seller_confirmed_delivery_at, now()), updated_at = now() where id = d.id;
    end if;
    update public.interests set status = 'completed', updated_at = now()
    where id = d.id and buyer_confirmed_delivery_at is not null and seller_confirmed_delivery_at is not null;
  elsif p_action = 'cancel' then
    if d.status not in ('proposed', 'accepted') then raise exception 'A deal can only be cancelled before shipping'; end if;
    update public.interests set status = 'cancelled', updated_at = now() where id = d.id;
  else
    raise exception 'Unknown action %', p_action;
  end if;
  return (select status::text from public.interests where id = d.id);
end $$;

-- Deals can no longer be edited directly (only OXL staff can correct them)
drop policy interests_update on public.interests;
create policy interests_update on public.interests for update to authenticated
  using (public.is_oxl_admin()) with check (public.is_oxl_admin());

-- ─────────────────────────────────────────────────────────────
-- 5. Trust report: "Delivery record" replaces "Completed trades"
-- ─────────────────────────────────────────────────────────────
create or replace function public.risk_report(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  org public.organisations;
  f jsonb := '[]'::jsonb;
  pts int; total int := 0;
  n_docs int; n_trades int; years int; n_profile int; n_rated int; n_ontime int; n_quality int;
  band text;
begin
  if not public.can_view_report(p_org_id) then
    raise exception 'This report has not been shared with your organisation';
  end if;
  select * into org from public.organisations where id = p_org_id;
  if not found then raise exception 'Organisation not found'; end if;

  pts := round(35 * public.tier_rank(org.verification_tier) / 3.0);
  f := f || jsonb_build_object('factor','Verification level','points',pts,'max',35,
        'detail', initcap(replace(org.verification_tier::text, '_', ' ')));
  total := total + pts;

  select count(distinct doc_type) into n_docs from public.documents
  where org_id = p_org_id and review_status = 'approved'
    and doc_type in ('business_registration','export_licence','tax_certificate','quality_certificate');
  pts := 5 * n_docs;
  f := f || jsonb_build_object('factor','Key documents approved','points',pts,'max',20,
        'detail', n_docs || ' of 4 (registration, export licence, tax, quality)');
  total := total + pts;

  years := case when org.year_established is null then 0
                else greatest(extract(year from now())::int - org.year_established, 0) end;
  pts := round(15 * least(years, 10) / 10.0);
  f := f || jsonb_build_object('factor','Years trading','points',pts,'max',15,
        'detail', case when org.year_established is null then 'Not stated' else years || ' years (since ' || org.year_established || ')' end);
  total := total + pts;

  -- Delivery record (15): completed deals (2 each, up to 10) + share delivered on time (up to 5)
  select count(*) into n_trades from public.interests i
  where i.status = 'completed' and (
    exists (select 1 from public.offers o where o.id = i.offer_id and o.org_id = p_org_id)
    or exists (select 1 from public.requests r where r.id = i.request_id and r.org_id = p_org_id));
  select count(*), count(*) filter (where on_time), count(*) filter (where quality_as_described)
    into n_rated, n_ontime, n_quality from public.ratings where rated_org_id = p_org_id;
  pts := 2 * least(n_trades, 5) + case when n_rated = 0 then 0 else round(5.0 * n_ontime / n_rated)::int end;
  f := f || jsonb_build_object('factor','Delivery record on OXL','points',pts,'max',15, 'detail',
        n_trades || ' completed deal' || case when n_trades = 1 then '' else 's' end
        || case when n_rated = 0 then '; no ratings yet'
                else '; ' || n_ontime || ' of ' || n_rated || ' rated on time, ' || n_quality || ' of ' || n_rated || ' as described' end);
  total := total + pts;

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

grant execute on function public.match_request(uuid), public.match_offer(uuid), public.advance_deal(uuid, text),
  public.risk_report(uuid), public.can_act_for(uuid) to authenticated;
revoke execute on function public.evaluate_pair(public.offers, public.requests) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Demo data for timing-aware matching (only affects organisations flagged is_demo)
-- ─────────────────────────────────────────────────────────────
update public.offers o set
  certificates = case when o.certificates = '{}' then '{phytosanitary}' else o.certificates end,
  collection_location_id = coalesce(o.collection_location_id, (select l.id from public.locations l where l.kind = 'town' and l.name = case org.city
      when 'Ho' then 'Accra' when 'Kintampo' then 'Techiman' when 'Machakos' then 'Nairobi' else org.city end))
from public.organisations org where org.id = o.org_id and org.is_demo;

update public.requests r set
  delivery_location_id = coalesce(r.delivery_location_id, (select l.id from public.locations l where l.kind = case when org.city = 'Mombasa' then 'port' else 'town' end and l.name = org.city)),
  needed_by = case r.hs_code when '0801' then date '2027-02-15' when '0902' then date '2027-02-01' when '0901' then date '2027-02-20'
                             when '0804' then date '2027-01-31' when '1515' then date '2026-12-20' else r.needed_by end
from public.organisations org where org.id = r.org_id and org.is_demo;

-- A second, later cocoa offer: its goods will be ready too late for the Nairobi buyer's deadline,
-- so it shows how the delivery-time check leaves a seller out (Conceptual Design Figure 2, Exporter B)
insert into public.offers (org_id, hs_code, grade, quantity_tonnes, price_usd_per_tonne, incoterm, origin_country, available_from, notes,
                           certificates, collection_location_id)
select 'a0000000-0000-0000-0000-000000000001', '1801', 'Grade I', 40, 7600, 'FOB', 'GH', date '2026-12-20', 'Light crop, ready late December (demo).',
       '{phytosanitary}', (select id from public.locations where name = 'Sunyani' and kind = 'town')
where exists (select 1 from public.organisations where id = 'a0000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.offers where org_id = 'a0000000-0000-0000-0000-000000000001' and available_from = date '2026-12-20');
