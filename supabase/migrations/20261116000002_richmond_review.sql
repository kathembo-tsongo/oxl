-- OXL MVP — Richmond's review of the wireframes (13 Nov 2026), part 2 of 2
--   A. Business activity chosen from a list (ISIC Rev.4 by default; OXL staff can load each country's list)
--   B. Identity documents: one ID for individuals, traders and agents; two IDs of directors or
--      representatives for enterprises, cooperatives, lenders and partners. Required before OXL raises
--      a trust level. ID files are never shown to lenders.
--   C. Business location pinned on a map (private to the business, its agent and OXL), with an automatic
--      consistency check and an OXL review
--   D. AI pre-check of an organisation (results stored for OXL staff)
--   E. Two-step sign-in: OXL staff act as admins only after a second factor (authenticator app)

-- ─────────────────────────────────────────────────────────────
-- Settings
-- ─────────────────────────────────────────────────────────────
insert into public.settings (key, value, description) values
  ('identity_required_for_verification', 'true', 'OXL cannot raise a trust level above Self-declared until the required identity documents are approved'),
  ('admin_requires_mfa', 'true', 'OXL staff must sign in with a second factor (authenticator app) before they can use admin functions'),
  ('geo_max_km_from_town', '50', 'A pinned business location further than this from its declared town is flagged for review')
on conflict (key) do nothing;

create or replace function public.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when jsonb_typeof(value) = 'boolean' then (value)::text::boolean
                               when jsonb_typeof(value) = 'string' then (value #>> '{}')::boolean end
                   from public.settings where key = p_key), p_default)
$$;
create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select case when jsonb_typeof(value) = 'number' then (value)::text::numeric
                               when jsonb_typeof(value) = 'string' then (value #>> '{}')::numeric end
                   from public.settings where key = p_key), p_default)
$$;

-- ─────────────────────────────────────────────────────────────
-- E. Two-step sign-in for OXL staff
--    Supabase puts the assurance level in the session token: aal1 = password only, aal2 = password + code.
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_oxl_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_oxl_admin from public.profiles where id = auth.uid()), false)
     and (not public.setting_bool('admin_requires_mfa', true)
          or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

-- ─────────────────────────────────────────────────────────────
-- A. Business activity classification
-- ─────────────────────────────────────────────────────────────
create table public.business_categories (
  id           uuid primary key default gen_random_uuid(),
  country      char(2) references public.countries(code),   -- null = offered in every country
  scheme       text not null default 'ISIC Rev.4',            -- e.g. 'ISIC Rev.4', 'KSIC Rev.1', 'GSIC Rev.4'
  code         text not null,
  name         text not null,
  parent_code  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index business_categories_key on public.business_categories (coalesce(country, '--'), scheme, code);
alter table public.business_categories enable row level security;
create policy business_categories_read on public.business_categories for select to authenticated using (true);
create policy business_categories_admin on public.business_categories for all to authenticated
  using (public.is_oxl_admin()) with check (public.is_oxl_admin());

alter table public.organisations add column business_category_id uuid references public.business_categories(id) on delete set null;

-- UN ISIC Rev.4: all sections, plus the divisions most OXL users fall under
insert into public.business_categories (country, scheme, code, name, parent_code) values
  (null, 'ISIC Rev.4', 'A', 'Agriculture, forestry and fishing', null),
  (null, 'ISIC Rev.4', 'B', 'Mining and quarrying', null),
  (null, 'ISIC Rev.4', 'C', 'Manufacturing', null),
  (null, 'ISIC Rev.4', 'D', 'Electricity, gas, steam and air conditioning supply', null),
  (null, 'ISIC Rev.4', 'E', 'Water supply; sewerage, waste management and remediation activities', null),
  (null, 'ISIC Rev.4', 'F', 'Construction', null),
  (null, 'ISIC Rev.4', 'G', 'Wholesale and retail trade; repair of motor vehicles and motorcycles', null),
  (null, 'ISIC Rev.4', 'H', 'Transportation and storage', null),
  (null, 'ISIC Rev.4', 'I', 'Accommodation and food service activities', null),
  (null, 'ISIC Rev.4', 'J', 'Information and communication', null),
  (null, 'ISIC Rev.4', 'K', 'Financial and insurance activities', null),
  (null, 'ISIC Rev.4', 'L', 'Real estate activities', null),
  (null, 'ISIC Rev.4', 'M', 'Professional, scientific and technical activities', null),
  (null, 'ISIC Rev.4', 'N', 'Administrative and support service activities', null),
  (null, 'ISIC Rev.4', 'O', 'Public administration and defence; compulsory social security', null),
  (null, 'ISIC Rev.4', 'P', 'Education', null),
  (null, 'ISIC Rev.4', 'Q', 'Human health and social work activities', null),
  (null, 'ISIC Rev.4', 'R', 'Arts, entertainment and recreation', null),
  (null, 'ISIC Rev.4', 'S', 'Other service activities', null),
  (null, 'ISIC Rev.4', 'T', 'Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use', null),
  (null, 'ISIC Rev.4', 'U', 'Activities of extraterritorial organizations and bodies', null),
  (null, 'ISIC Rev.4', '01', 'Crop and animal production, hunting and related service activities', 'A'),
  (null, 'ISIC Rev.4', '02', 'Forestry and logging', 'A'),
  (null, 'ISIC Rev.4', '03', 'Fishing and aquaculture', 'A'),
  (null, 'ISIC Rev.4', '10', 'Manufacture of food products', 'C'),
  (null, 'ISIC Rev.4', '11', 'Manufacture of beverages', 'C'),
  (null, 'ISIC Rev.4', '13', 'Manufacture of textiles', 'C'),
  (null, 'ISIC Rev.4', '46', 'Wholesale trade, except of motor vehicles and motorcycles', 'G'),
  (null, 'ISIC Rev.4', '47', 'Retail trade, except of motor vehicles and motorcycles', 'G'),
  (null, 'ISIC Rev.4', '49', 'Land transport and transport via pipelines', 'H'),
  (null, 'ISIC Rev.4', '52', 'Warehousing and support activities for transportation', 'H'),
  (null, 'ISIC Rev.4', '64', 'Financial service activities, except insurance and pension funding', 'K'),
  (null, 'ISIC Rev.4', '66', 'Activities auxiliary to financial service and insurance activities', 'K'),
  (null, 'ISIC Rev.4', '70', 'Activities of head offices; management consultancy activities', 'M'),
  (null, 'ISIC Rev.4', '82', 'Office administrative, office support and other business support activities', 'N'),
  (null, 'ISIC Rev.4', '94', 'Activities of membership organizations', 'S')
on conflict do nothing;

-- OXL staff load a country's own list (e.g. KSIC for Kenya) from a CSV: rows = [{code, name, parent_code}]
create or replace function public.import_business_categories(p_country char(2), p_scheme text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can load business activity lists'; end if;
  if coalesce(trim(p_scheme), '') = '' then raise exception 'Give the name of the classification, e.g. KSIC Rev.1'; end if;
  insert into public.business_categories (country, scheme, code, name, parent_code)
  select nullif(p_country, ''), trim(p_scheme), trim(r ->> 'code'), trim(r ->> 'name'), nullif(trim(r ->> 'parent_code'), '')
  from jsonb_array_elements(p_rows) r
  where coalesce(trim(r ->> 'code'), '') <> '' and coalesce(trim(r ->> 'name'), '') <> ''
  on conflict (coalesce(country, '--'), scheme, code) do update
    set name = excluded.name, parent_code = excluded.parent_code, is_active = true;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.import_business_categories(char, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- B. Identity documents
-- ─────────────────────────────────────────────────────────────
alter table public.documents
  add column holder_name text,      -- whose ID this is (for directors / representatives)
  add column holder_role text,      -- e.g. 'Director', 'Chairperson', 'Authorised representative'
  add constraint documents_representative_named check (doc_type <> 'representative_id' or coalesce(trim(holder_name), '') <> '');

-- What a business must provide, and how far it has got
create or replace function public.identity_requirement(p_org uuid)
returns table (kind text, doc_type text, required int, uploaded int, approved int)
language plpgsql stable security definer set search_path = public as $$
declare o record;
begin
  select role, entity_type into o from public.organisations where id = p_org;
  if not found then return; end if;
  if not (p_org = public.my_org_id() or public.is_oxl_admin() or public.is_active_agent_of(p_org)
          or public.officer_can_visit(p_org)) then
    return;
  end if;
  if o.role = 'agent' or o.entity_type in ('individual', 'trader') then
    return query
      select 'personal'::text, 'national_id'::text, 1,
             count(*) filter (where d.review_status <> 'rejected')::int,
             count(*) filter (where d.review_status = 'approved')::int
      from public.documents d where d.org_id = p_org and d.doc_type = 'national_id';
  else
    return query
      select 'representatives'::text, 'representative_id'::text, 2,
             count(distinct lower(trim(d.holder_name))) filter (where d.review_status <> 'rejected')::int,
             count(distinct lower(trim(d.holder_name))) filter (where d.review_status = 'approved')::int
      from public.documents d where d.org_id = p_org and d.doc_type = 'representative_id';
  end if;
end $$;
grant execute on function public.identity_requirement(uuid) to authenticated;

-- OXL raises a trust level only once identity documents are approved (setting can switch this off)
create or replace function public.set_verification_tier(
  p_org_id uuid, p_tier public.verification_tier, p_method text, p_notes text
) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL admins can verify organisations'; end if;
  if p_tier <> 'self_declared' and public.setting_bool('identity_required_for_verification', true) then
    select * into r from public.identity_requirement(p_org_id);
    if found and r.approved < r.required then
      raise exception 'Identity documents not complete: % of % approved. Approve the % first.',
        r.approved, r.required, case when r.kind = 'personal' then 'national ID or passport' else 'IDs of two directors or representatives' end;
    end if;
  end if;
  perform set_config('oxl.allow_tier_change', 'on', true);
  update public.organisations set verification_tier = p_tier where id = p_org_id;
  insert into public.verifications (org_id, tier, method, notes, verified_by)
  values (p_org_id, p_tier, p_method, p_notes, auth.uid());
end $$;

-- ID documents: only the business itself, its agent (with document access) and OXL staff, never lenders
drop policy documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (case when doc_type in ('national_id', 'representative_id')
              then org_id = public.my_org_id() or public.is_oxl_admin() or public.agent_can_view_documents(org_id)
              else public.can_view_report(org_id) or public.agent_can_view_documents(org_id) end);

-- ID files go in '<org id>/identity/…'; the same rule applies to the files themselves
drop policy "read documents: org, admins, financiers, agents" on storage.objects;
create policy "read documents: org, admins, financiers, agents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    case when (storage.foldername(name))[2] = 'identity'
         then ((storage.foldername(name))[1] = public.my_org_id()::text or public.is_oxl_admin()
               or public.agent_can_view_documents(((storage.foldername(name))[1])::uuid))
         else (public.can_view_report(((storage.foldername(name))[1])::uuid)
               or public.agent_can_view_documents(((storage.foldername(name))[1])::uuid)) end));

-- ─────────────────────────────────────────────────────────────
-- C. Business location on a map
--    The coordinates sit in their own table, seen only by the business, its agent, its field officer and
--    OXL staff (a farmer's pin may be their home). Everyone sees only the status on the organisation.
-- ─────────────────────────────────────────────────────────────
alter table public.organisations
  add column geo_status text not null default 'none'
    check (geo_status in ('none', 'auto_ok', 'auto_flagged', 'verified', 'rejected'));

create table public.org_locations (
  org_id       uuid primary key references public.organisations(id) on delete cascade,
  lat          numeric(9,6) not null check (lat between -90 and 90),
  lon          numeric(9,6) not null check (lon between -180 and 180),
  accuracy_m   int check (accuracy_m >= 0),
  source       text not null default 'map' check (source in ('device', 'map')),
  auto_check   jsonb,
  set_by       uuid references auth.users(id) on delete set null,
  set_at       timestamptz not null default now(),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text
);
alter table public.org_locations enable row level security;
create policy org_locations_read on public.org_locations for select to authenticated
  using (org_id = public.my_org_id() or public.is_oxl_admin() or public.is_active_agent_of(org_id) or public.officer_can_visit(org_id));
-- no insert/update/delete policies: changes go through set_org_location() and review_org_location()

create or replace function public.km_between(a_lat numeric, a_lon numeric, b_lat numeric, b_lon numeric) returns numeric
language sql immutable as $$
  select round((6371 * 2 * asin(sqrt(
           power(sin(radians((b_lat - a_lat) / 2)), 2)
         + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians((b_lon - a_lon) / 2)), 2))))::numeric, 1)
$$;

-- Automatic check of a pin: is it near the declared town, and in the declared country?
create or replace function public.geo_auto_check(p_org uuid, p_lat numeric, p_lon numeric, p_accuracy_m int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o record; near record; town record; flags text[] := '{}'; max_km numeric := public.setting_num('geo_max_km_from_town', 50);
begin
  select country, city, location_id into o from public.organisations where id = p_org;
  select l.name, l.country, public.km_between(p_lat, p_lon, l.lat, l.lon) km into near
  from public.locations l where l.lat is not null order by 3 limit 1;
  select l.name, l.country, public.km_between(p_lat, p_lon, l.lat, l.lon) km into town
  from public.locations l
  where l.lat is not null and (l.id = o.location_id
        or (o.location_id is null and o.city is not null and l.country = o.country and lower(l.name) = lower(trim(o.city))))
  order by (l.id = o.location_id) desc nulls last limit 1;
  if near.name is null then flags := flags || 'No reference places with coordinates to compare with'::text;
  elsif near.country <> o.country and near.km < 300 then
    flags := flags || format('Nearest known place is %s (%s), not in the declared country %s', near.name, near.country, o.country);
  end if;
  if town.name is not null and town.km > max_km then
    flags := flags || format('%s km from the declared town %s', town.km, town.name);
  end if;
  if p_accuracy_m is not null and p_accuracy_m > 1000 then
    flags := flags || format('Low accuracy (about %s m)', p_accuracy_m);
  end if;
  return jsonb_build_object(
    'nearest_place', near.name, 'nearest_country', near.country, 'nearest_km', near.km,
    'declared_town', town.name, 'declared_town_km', town.km, 'max_km', max_km,
    'flags', to_jsonb(flags), 'checked_at', now());
end $$;

-- Only the location functions below may change the status shown on the organisation.
-- Not SECURITY DEFINER: current_user must be the caller.
create or replace function public.guard_geo_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.geo_status is distinct from old.geo_status
     and coalesce(current_setting('oxl.geo_change', true), 'off') <> 'on'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'The location status can only be changed by OXL staff';
  end if;
  return new;
end $$;
create trigger trg_guard_geo_status before update on public.organisations for each row execute function public.guard_geo_status();

-- The business, its agent, its field officer or OXL staff pin the location (null lat removes the pin)
create or replace function public.set_org_location(p_org uuid, p_lat numeric, p_lon numeric, p_accuracy_m int, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare chk jsonb; st text;
begin
  if not (p_org = public.my_org_id() or public.is_active_agent_of(p_org) or public.officer_can_visit(p_org) or public.is_oxl_admin()) then
    raise exception 'You cannot set the location of this organisation';
  end if;
  perform set_config('oxl.geo_change', 'on', true);
  if p_lat is null or p_lon is null then
    delete from public.org_locations where org_id = p_org;
    update public.organisations set geo_status = 'none' where id = p_org;
    return jsonb_build_object('status', 'none');
  end if;
  chk := public.geo_auto_check(p_org, p_lat, p_lon, p_accuracy_m);
  st := case when jsonb_array_length(chk -> 'flags') = 0 then 'auto_ok' else 'auto_flagged' end;
  insert into public.org_locations (org_id, lat, lon, accuracy_m, source, auto_check, set_by, set_at)
  values (p_org, p_lat, p_lon, p_accuracy_m, coalesce(p_source, 'map'), chk, auth.uid(), now())
  on conflict (org_id) do update set lat = excluded.lat, lon = excluded.lon, accuracy_m = excluded.accuracy_m,
    source = excluded.source, auto_check = excluded.auto_check, set_by = excluded.set_by, set_at = excluded.set_at,
    reviewed_by = null, reviewed_at = null, review_note = null;
  update public.organisations set geo_status = st where id = p_org;
  return jsonb_build_object('status', st, 'check', chk);
end $$;
grant execute on function public.set_org_location(uuid, numeric, numeric, int, text) to authenticated;

-- OXL staff confirm or reject the pinned location
create or replace function public.review_org_location(p_org uuid, p_ok boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can review a location'; end if;
  update public.org_locations set reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where org_id = p_org;
  if not found then raise exception 'This organisation has not pinned a location yet'; end if;
  perform set_config('oxl.geo_change', 'on', true);
  update public.organisations set geo_status = case when p_ok then 'verified' else 'rejected' end where id = p_org;
end $$;
grant execute on function public.review_org_location(uuid, boolean, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- D. AI pre-check of an organisation (written by the verify-organisation edge function)
-- ─────────────────────────────────────────────────────────────
create table public.org_ai_checks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  status        text not null check (status in ('done', 'failed')),
  result        jsonb,
  model         text,
  error         text,
  requested_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.org_ai_checks (org_id, created_at desc);
alter table public.org_ai_checks enable row level security;
create policy org_ai_checks_admin_read on public.org_ai_checks for select to authenticated using (public.is_oxl_admin());

grant execute on function public.setting_bool(text, boolean), public.setting_num(text, numeric),
  public.km_between(numeric, numeric, numeric, numeric) to authenticated;
revoke execute on function public.geo_auto_check(uuid, numeric, numeric, int) from public, anon, authenticated;
