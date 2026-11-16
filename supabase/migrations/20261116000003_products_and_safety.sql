-- OXL MVP — Milestone 8 (16 Nov 2026), from Richmond's review
--   A. Products beyond farming: product category, unit of sale (tonnes, pieces, cartons, litres…),
--      weight per unit for transport cost, products OXL staff can add or hide; matching speaks each
--      product's unit. Starter non-farm products are added hidden, for OXL staff to switch on.
--   B. Safety: automatic risk signals, "Report a problem", OXL review, and safety alerts sent to everyone
--      in an open deal with the business. A high alert also stops new matches.

-- ─────────────────────────────────────────────────────────────
-- A. Products
-- ─────────────────────────────────────────────────────────────
alter table public.commodities
  add column category     text not null default 'farm' check (category in ('farm', 'processed', 'manufactured', 'mineral', 'other')),
  add column unit         text not null default 't' check (unit in ('t', 'kg', 'pieces', 'cartons', 'bags', 'litres', 'm3', 'metres')),
  add column kg_per_unit  numeric check (kg_per_unit > 0),   -- for transport cost when the unit is not a weight
  add column is_active    boolean not null default true,
  add column notes        text;
update public.commodities set category = 'processed' where hs_code in ('1803', '1515');

create or replace function public.unit_short(p_unit text) returns text
language sql immutable as $$
  select case p_unit when 't' then 't' when 'kg' then 'kg' when 'pieces' then 'pcs' when 'cartons' then 'cartons'
                     when 'bags' then 'bags' when 'litres' then 'L' when 'm3' then 'm³' when 'metres' then 'm' else coalesce(p_unit, 't') end
$$;
grant execute on function public.unit_short(text) to authenticated;

create policy commodities_admin on public.commodities for all to authenticated
  using (public.is_oxl_admin()) with check (public.is_oxl_admin());

-- Starter non-farm products, hidden until OXL staff switch them on (Reference data › Products)
insert into public.commodities (hs_code, name, category, unit, kg_per_unit, is_active) values
  ('3401', 'Soap', 'manufactured', 'cartons', null, false),
  ('3304', 'Beauty and skin-care products', 'manufactured', 'cartons', null, false),
  ('2523', 'Cement', 'manufactured', 't', null, false),
  ('3923', 'Plastic packaging (bottles, crates, bags)', 'manufactured', 't', null, false),
  ('5208', 'Woven cotton fabric', 'manufactured', 'metres', null, false),
  ('6109', 'T-shirts and vests, knitted', 'manufactured', 'pieces', 0.2, false),
  ('9403', 'Furniture', 'manufactured', 'pieces', null, false),
  ('4602', 'Baskets and woven crafts', 'manufactured', 'pieces', null, false),
  ('8541', 'Solar panels and cells', 'manufactured', 'pieces', null, false),
  ('2202', 'Soft drinks and juices', 'processed', 'litres', 1.05, false),
  ('1905', 'Biscuits and baked goods', 'processed', 'cartons', null, false),
  ('7108', 'Gold (unwrought or semi-manufactured)', 'mineral', 'kg', null, false)
on conflict (hs_code) do nothing;

-- ─────────────────────────────────────────────────────────────
-- B. Safety
-- ─────────────────────────────────────────────────────────────
alter table public.organisations
  add column safety_alert       text check (safety_alert in ('caution', 'high')),
  add column safety_alert_note  text;

create or replace function public.guard_safety_alert() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.safety_alert is distinct from old.safety_alert or new.safety_alert_note is distinct from old.safety_alert_note)
     and coalesce(current_setting('oxl.safety_change', true), 'off') <> 'on'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Only OXL staff can set a safety alert';
  end if;
  return new;
end $$;
create trigger trg_guard_safety_alert before update on public.organisations for each row execute function public.guard_safety_alert();

create table public.risk_flags (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organisations(id) on delete cascade,
  kind             text not null,   -- e.g. 'price_far_below_market', 'id_name_mismatch', 'reported_by_users'
  severity         text not null check (severity in ('low', 'medium', 'high')),
  detail           text not null,
  source           text not null default 'rule' check (source in ('rule', 'report', 'ai', 'staff')),
  status           text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_by      uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,
  resolution_note  text
);
create unique index risk_flags_one_open on public.risk_flags (org_id, kind) where status = 'open';
alter table public.risk_flags enable row level security;
create policy risk_flags_admin on public.risk_flags for select to authenticated using (public.is_oxl_admin());

create table public.problem_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_org_id  uuid not null references public.organisations(id) on delete cascade,
  reported_by      uuid references auth.users(id) on delete set null default auth.uid(),
  reported_org_id  uuid not null references public.organisations(id) on delete cascade,
  interest_id      uuid references public.interests(id) on delete set null,
  category         text not null check (category in ('fraud', 'non_delivery', 'quality', 'payment', 'impersonation', 'harassment', 'other')),
  description      text not null check (length(trim(description)) >= 10),
  status           text not null default 'new' check (status in ('new', 'investigating', 'resolved', 'dismissed')),
  admin_note       text,
  created_at       timestamptz not null default now(),
  resolved_by      uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,
  check (reporter_org_id <> reported_org_id)
);
create index on public.problem_reports (reported_org_id);
alter table public.problem_reports enable row level security;
create policy problem_reports_read on public.problem_reports for select to authenticated
  using (reporter_org_id = public.my_org_id() or public.is_oxl_admin());
create policy problem_reports_insert on public.problem_reports for insert to authenticated
  with check ((reporter_org_id = public.my_org_id() or public.is_active_agent_of(reporter_org_id))
              and status = 'new' and admin_note is null and resolved_at is null);

-- Raise (or refresh) one open signal per business and kind
create or replace function public.raise_flag(p_org uuid, p_kind text, p_severity text, p_detail text, p_source text default 'rule')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.risk_flags (org_id, kind, severity, detail, source) values (p_org, p_kind, p_severity, p_detail, p_source)
  on conflict (org_id, kind) where status = 'open'
  do update set severity = case when excluded.severity = 'high' or public.risk_flags.severity = 'high' then 'high'
                                when excluded.severity = 'medium' or public.risk_flags.severity = 'medium' then 'medium' else 'low' end,
                detail = excluded.detail, updated_at = now();
end $$;
revoke execute on function public.raise_flag(uuid, text, text, text, text) from public, anon, authenticated;

-- Signal 1: an offer priced far below the other open offers for the same product
create or replace function public.trg_flag_offer_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare med numeric; n int; o record;
begin
  if new.price_usd_per_tonne is null or new.status <> 'open' then return new; end if;
  select percentile_cont(0.5) within group (order by price_usd_per_tonne), count(*) into med, n
  from public.offers where hs_code = new.hs_code and status = 'open' and id <> new.id and price_usd_per_tonne is not null;
  if n >= 3 and new.price_usd_per_tonne < 0.5 * med then
    select created_at, verification_tier into o from public.organisations where id = new.org_id;
    perform public.raise_flag(new.org_id, 'price_far_below_market',
      case when o.created_at > now() - interval '30 days' and o.verification_tier = 'self_declared' then 'high' else 'medium' end,
      format('Offer at $%s against a typical $%s for the same product (%s other offers)%s', trim_scale(new.price_usd_per_tonne), round(med), n,
             case when o.created_at > now() - interval '30 days' then '; account less than 30 days old' else '' end));
  end if;
  return new;
end $$;
create trigger trg_flag_offer_price after insert or update of price_usd_per_tonne, status on public.offers
  for each row execute function public.trg_flag_offer_price();

-- Signal 2: what the AI read on a document (name on an ID that does not match; red flags; expired)
create or replace function public.trg_flag_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare flags text;
begin
  if new.extracted is null or new.extracted is not distinct from old.extracted then return new; end if;
  if new.doc_type in ('national_id', 'representative_id') and (new.extracted ->> 'name_matches') = 'false' then
    perform public.raise_flag(new.org_id, 'id_name_mismatch', 'high',
      format('Name on the ID (%s) does not match the declared person%s', coalesce(new.extracted ->> 'holder_name', 'unreadable'),
             coalesce(' ' || new.holder_name, '')));
  end if;
  select string_agg(x, '; ') into flags from jsonb_array_elements_text(
    case when jsonb_typeof(new.extracted -> 'red_flags') = 'array' then new.extracted -> 'red_flags' else '[]'::jsonb end) x;
  if flags is not null then
    perform public.raise_flag(new.org_id, 'document_red_flags', 'medium', format('%s: %s', replace(new.doc_type::text, '_', ' '), flags));
  end if;
  return new;
end $$;
create trigger trg_flag_document after update of extracted on public.documents
  for each row execute function public.trg_flag_document();

-- Signal 3: a pinned location in another country, or far from the declared town
create or replace function public.trg_flag_location() returns trigger
language plpgsql security definer set search_path = public as $$
declare flags text;
begin
  select string_agg(x, '; ') into flags from jsonb_array_elements_text(coalesce(new.auto_check -> 'flags', '[]'::jsonb)) x
  where x not like 'No reference places%' and x not like 'Low accuracy%';
  if flags is not null then
    perform public.raise_flag(new.org_id, 'location_inconsistent', case when flags like '%not in the declared country%' then 'medium' else 'low' end, flags);
  end if;
  return new;
end $$;
create trigger trg_flag_location after insert or update of auto_check on public.org_locations
  for each row execute function public.trg_flag_location();

-- Signal 4: reports from other users (two or more different reporters = high)
create or replace function public.trg_problem_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; reporter text; reported text;
begin
  select count(distinct reporter_org_id) into n from public.problem_reports where reported_org_id = new.reported_org_id and status in ('new', 'investigating');
  select name into reporter from public.organisations where id = new.reporter_org_id;
  select name into reported from public.organisations where id = new.reported_org_id;
  perform public.raise_flag(new.reported_org_id, 'reported_by_users', case when n >= 2 or new.category in ('fraud', 'impersonation') then 'high' else 'medium' end,
    format('%s report(s) from %s user(s); latest: %s from %s', (select count(*) from public.problem_reports where reported_org_id = new.reported_org_id and status in ('new', 'investigating')),
           n, replace(new.category, '_', ' '), reporter), 'report');
  perform public.notify(new.reporter_org_id, 'We received your report', 'OXL staff will look into your report about ' || reported || ' and get back to you. Do not send money or goods while it is under review.', '/notifications');
  return new;
end $$;
create trigger trg_problem_report after insert on public.problem_reports for each row execute function public.trg_problem_report();

-- Everyone in an open deal with this business (and their agents)
create or replace function public.open_deal_counterparties(p_org uuid)
returns table (org_id uuid) language sql stable security definer set search_path = public as $$
  with d as (
    select o.org_id as seller, r.org_id as buyer, i.agent_org_id as agent
    from public.interests i join public.offers o on o.id = i.offer_id join public.requests r on r.id = i.request_id
    where (o.org_id = p_org or r.org_id = p_org) and i.status in ('proposed', 'accepted', 'in_transit'))
  select x from (select seller from d union select buyer from d union select agent from d) u(x)
  where x is not null and x <> p_org
$$;
revoke execute on function public.open_deal_counterparties(uuid) from public, anon, authenticated;

-- OXL staff: confirm a signal (optionally with a safety alert sent to every counterparty) or dismiss it
create or replace function public.review_risk_flag(p_flag uuid, p_confirm boolean, p_alert text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can review safety signals'; end if;
  update public.risk_flags set status = case when p_confirm then 'confirmed' else 'dismissed' end,
         resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_note
   where id = p_flag and status = 'open' returning * into f;
  if not found then raise exception 'This signal is no longer open'; end if;
  if p_confirm and p_alert in ('caution', 'high') then
    perform public.set_safety_alert(f.org_id, p_alert, coalesce(p_note, f.detail));
  end if;
end $$;
grant execute on function public.review_risk_flag(uuid, boolean, text, text) to authenticated;

create or replace function public.set_safety_alert(p_org uuid, p_alert text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text; c record;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can set a safety alert'; end if;
  if p_alert is not null and p_alert not in ('caution', 'high') then raise exception 'Alert must be caution or high'; end if;
  perform set_config('oxl.safety_change', 'on', true);
  update public.organisations set safety_alert = p_alert, safety_alert_note = case when p_alert is null then null else p_note end
   where id = p_org returning name into nm;
  if p_alert is null then
    for c in select * from public.open_deal_counterparties(p_org) loop
      perform public.notify(c.org_id, 'Safety alert lifted: ' || nm, 'OXL has reviewed ' || nm || ' and lifted its safety alert.', '/');
    end loop;
    perform public.notify(p_org, 'Safety alert lifted', 'OXL has lifted the safety alert on your account.', '/profile');
  else
    for c in select * from public.open_deal_counterparties(p_org) loop
      perform public.notify(c.org_id, case when p_alert = 'high' then 'Safety alert: pause your deal with ' else 'Caution about ' end || nm,
        case when p_alert = 'high' then 'OXL found serious concerns about ' || nm || '. Do not send money or goods until OXL contacts you.'
             else 'OXL is checking concerns about ' || nm || '. Confirm documents and payment details through OXL before you pay or ship.' end, '/');
    end loop;
    perform public.notify(p_org, 'OXL needs to talk to you', 'OXL has placed a ' || p_alert || ' safety alert on your account while it reviews some information. Please contact OXL.', '/profile');
  end if;
end $$;
grant execute on function public.set_safety_alert(uuid, text, text) to authenticated;

-- OXL staff: update a report, and tell the reporter
create or replace function public.update_problem_report(p_report uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can update reports'; end if;
  update public.problem_reports set status = p_status, admin_note = coalesce(p_note, admin_note),
         resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
   where id = p_report returning * into r;
  if not found then raise exception 'Report not found'; end if;
  perform public.notify(r.reporter_org_id, 'Update on your report',
    'Your report is now ' || p_status || coalesce('. ' || p_note, '.'), '/notifications');
end $$;
grant execute on function public.update_problem_report(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Matching speaks each product's unit, and a high safety alert stops new matches
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
  v_unit text; v_kg numeric; v_unit_cost numeric;
  checks jsonb := '[]'::jsonb; f jsonb := '[]'::jsonb; ok boolean; passed boolean := true;
  pts int; total int := 0;
  fmt constant text := 'DD Mon YYYY';
begin
  select * into seller from public.organisations where id = o.org_id;
  select * into buyer  from public.organisations where id = r.org_id;
  -- Unit of sale: tonnes for most farm produce; pieces, cartons, litres… for other goods
  select public.unit_short(c.unit), case c.unit when 't' then 1000 when 'kg' then 1 else c.kg_per_unit end
    into v_unit, v_kg from public.commodities c where c.hs_code = o.hs_code;
  v_unit := coalesce(v_unit, 't');

  -- Route and estimated arrival
  select * into rt from public.route_estimate(o.collection_location_id, r.delivery_location_id, o.origin_country, r.destination_country, r.transport_mode);
  if rt.route_id is not null then
    v_days := rt.total_days; v_cost := rt.cost_usd_per_tonne; v_label := rt.label;
  elsif o.origin_country = r.destination_country then
    v_days := 3; v_label := 'domestic delivery, about 3 days';
  end if;
  if v_days is not null then v_arrival := v_ready + v_days; end if;
  v_unit_cost := case when v_cost is null or v_kg is null then null else round(v_cost * v_kg / 1000, 2) end;
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
         when ok then trim_scale(v_supply) || ' ' || v_unit || ' available, minimum order ' || trim_scale(r.min_quantity_tonnes) || ' ' || v_unit
         else 'Only ' || trim_scale(v_supply) || ' ' || v_unit || ' available; minimum order is ' || trim_scale(r.min_quantity_tonnes) || ' ' || v_unit end);
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
        and coalesce(seller.safety_alert, '') <> 'high' and coalesce(buyer.safety_alert, '') <> 'high'
        and not exists (select 1 from public.sanctions_entries s where lower(trim(s.name)) in (lower(trim(seller.name)), lower(trim(buyer.name))));
  checks := checks || jsonb_build_object('check', 'Safe to connect', 'passed', ok, 'detail',
    case when ok then 'Active, no safety alert, passed sanctions screening' else 'Not eligible for matching' end);
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
    v_landed := o.price_usd_per_tonne + case when o.incoterm in ('CFR', 'CIF', 'DAP', 'DDP') then 0 else coalesce(v_unit_cost, 0) end;
    pts := case when v_landed <= r.target_price_usd_per_tonne then 15
                when v_landed <= r.target_price_usd_per_tonne * 1.10 then 8 else 2 end;
    f := f || jsonb_build_object('factor', 'Landed price', 'points', pts, 'max', 15, 'detail',
          'About $' || trim_scale(round(v_landed, case when v_landed < 100 then 2 else 0 end)) || '/' || v_unit || ' landed'
          || case when o.incoterm in ('CFR', 'CIF', 'DAP', 'DDP') then ' (' || o.incoterm || ', freight included)'
                  when v_unit_cost is not null then ' ($' || trim_scale(o.price_usd_per_tonne) || ' + $' || trim_scale(v_unit_cost) || ' transport)'
                  else ' (transport cost unknown)' end
          || ' vs $' || trim_scale(r.target_price_usd_per_tonne) || '/' || v_unit || ' target'
          || case when (select is_african from public.countries where code = o.origin_country)
                   and (select is_african from public.countries where code = r.destination_country)
                   and o.origin_country <> r.destination_country
                  then '; may qualify for AfCFTA reduced duty' else '' end);
  end if;
  total := total + pts;

  -- Quantity fit (15)
  pts := round(15 * least(v_supply / r.quantity_tonnes, 1))::int;
  f := f || jsonb_build_object('factor', 'Quantity fit', 'points', pts, 'max', 15, 'detail',
        trim_scale(v_supply) || ' ' || v_unit || ' available for ' || trim_scale(r.quantity_tonnes) || ' ' || v_unit || ' needed (' || round(100 * least(v_supply / r.quantity_tonnes, 1)) || '%)');
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
revoke execute on function public.evaluate_pair(public.offers, public.requests) from public, anon, authenticated;
