-- OXL MVP — Week 1 (tasks 3–4), part 2 of 2: new tables, new columns and access rules
-- for the updated Conceptual Design: agents and consent, timing-aware matching (locations,
-- routes, ready / needed-by details), destination certificate rules, sanctions screening,
-- deal tracking to delivery with ratings, field visits, partner memberships and AI prospects.

-- ─────────────────────────────────────────────────────────────
-- 1. Platform settings (e.g. safety margin for the delivery-time check)
-- ─────────────────────────────────────────────────────────────
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
insert into public.settings (key, value, description) values
  ('safety_margin_days', '10', 'Days of buffer the delivery-time check keeps before a buyer''s needed-by date')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2. Locations: towns, ports, border posts and airports (map points for distance and routing)
-- ─────────────────────────────────────────────────────────────
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     char(2) not null references public.countries(code),
  kind        text not null check (kind in ('town', 'port', 'border', 'airport')),
  lat         numeric(9,6) check (lat between -90 and 90),
  lon         numeric(9,6) check (lon between -180 and 180),
  created_at  timestamptz not null default now(),
  unique (name, country, kind)
);

-- ─────────────────────────────────────────────────────────────
-- 3. Organisations: home location and suspension
-- ─────────────────────────────────────────────────────────────
alter table public.organisations
  add column location_id      uuid references public.locations(id) on delete set null,
  add column is_suspended     boolean not null default false,
  add column suspended_reason text;

-- Only OXL admins may change verification tier or suspension
create or replace function public.guard_verification_tier() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.verification_tier is distinct from old.verification_tier
     and coalesce(current_setting('oxl.allow_tier_change', true), 'off') <> 'on' then
    raise exception 'verification_tier can only be changed by an OXL admin';
  end if;
  if (new.is_suspended is distinct from old.is_suspended or new.suspended_reason is distinct from old.suspended_reason)
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_oxl_admin() then
    raise exception 'Only OXL admins can suspend or reinstate an organisation';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Agents and brokers (§3)
-- ─────────────────────────────────────────────────────────────
-- An agent is an organisation with role 'agent'; this table holds the agent-specific details.
create table public.agent_profiles (
  org_id                     uuid primary key references public.organisations(id) on delete cascade,
  areas_covered              text[] not null default '{}',   -- counties / regions
  references_text            text,                           -- two references, names and phone numbers
  endorsing_body             text,                           -- cooperative, association or chamber
  code_of_conduct_signed_at  timestamptz,
  typical_fee_note           text,                           -- e.g. '2% of deal value, paid by seller'
  created_at                 timestamptz not null default now()
);

-- Agent ↔ client link with recorded consent (§3.3, §9)
create table public.agent_clients (
  id                  uuid primary key default gen_random_uuid(),
  agent_org_id        uuid not null references public.organisations(id) on delete cascade,
  client_org_id       uuid not null references public.organisations(id) on delete cascade,
  consent_method      text not null check (consent_method in ('in_app', 'signed_form', 'recorded_verbal')),
  consent_note        text,
  consent_given_at    timestamptz not null default now(),
  can_view_documents  boolean not null default false,   -- only the client (or OXL) can turn this on
  withdrawn_at        timestamptz,                      -- consent withdrawn → agent loses access
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  unique (agent_org_id, client_org_id),
  check (agent_org_id <> client_org_id)
);
create index on public.agent_clients (client_org_id);

-- Helper functions (SECURITY DEFINER so policies can call them without recursion)
create or replace function public.org_role_of(p_org_id uuid) returns public.org_role
language sql stable security definer set search_path = public as $$
  select role from public.organisations where id = p_org_id
$$;

create or replace function public.is_active_agent_of(p_client_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agent_clients ac
    join public.organisations a on a.id = ac.agent_org_id
    where ac.agent_org_id = public.my_org_id()
      and ac.client_org_id = p_client_org_id
      and ac.withdrawn_at is null
      and a.role = 'agent' and not a.is_suspended)
$$;

create or replace function public.agent_can_view_documents(p_client_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agent_clients ac
    join public.organisations a on a.id = ac.agent_org_id
    where ac.agent_org_id = public.my_org_id()
      and ac.client_org_id = p_client_org_id
      and ac.withdrawn_at is null and ac.can_view_documents
      and a.role = 'agent' and not a.is_suspended)
$$;

-- Agents cannot grant themselves document access or undo a withdrawal
create or replace function public.guard_agent_client() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or public.is_oxl_admin() then
    return new;
  end if;
  if public.my_org_id() = new.agent_org_id then
    if tg_op = 'INSERT' and new.can_view_documents then
      raise exception 'Only the client can allow an agent to see its documents';
    end if;
    if tg_op = 'UPDATE' then
      if new.can_view_documents and not old.can_view_documents then
        raise exception 'Only the client can allow an agent to see its documents';
      end if;
      if old.withdrawn_at is not null and new.withdrawn_at is null then
        raise exception 'Consent that was withdrawn can only be renewed by the client';
      end if;
      if new.agent_org_id <> old.agent_org_id or new.client_org_id <> old.client_org_id
         or new.consent_given_at <> old.consent_given_at then
        raise exception 'Consent records cannot be rewritten';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_agent_client
before insert or update on public.agent_clients
for each row execute function public.guard_agent_client();

-- ─────────────────────────────────────────────────────────────
-- 5. Offers and requests: details needed for timing-aware matching (§5.3)
-- ─────────────────────────────────────────────────────────────
comment on column public.offers.available_from is 'Ready date: when the goods will be ready for collection';
alter table public.offers
  add column monthly_capacity_tonnes  numeric(12,2) check (monthly_capacity_tonnes > 0),
  add column harvest_season           text,
  add column collection_location_id   uuid references public.locations(id) on delete set null,
  add column certificates             text[] not null default '{}',   -- e.g. {phytosanitary, organic, fairtrade}
  add column updated_at               timestamptz not null default now();

alter table public.requests
  add column min_quantity_tonnes      numeric(12,2) check (min_quantity_tonnes > 0),
  add column delivery_location_id     uuid references public.locations(id) on delete set null,
  add column transport_mode           text not null default 'any' check (transport_mode in ('sea', 'road', 'air', 'any')),
  add column preferred_certificates   text[] not null default '{}',
  add column updated_at               timestamptz not null default now();

-- ─────────────────────────────────────────────────────────────
-- 6. Route table: typical transport times and costs (§5.3)
-- ─────────────────────────────────────────────────────────────
create table public.routes (
  id                  uuid primary key default gen_random_uuid(),
  from_location_id    uuid not null references public.locations(id) on delete cascade,
  to_location_id      uuid not null references public.locations(id) on delete cascade,
  mode                text not null check (mode in ('sea', 'road', 'air')),
  inland_days         int not null default 0 check (inland_days >= 0),    -- to the port or border
  port_days           int not null default 0 check (port_days >= 0),      -- port or border handling
  transit_days        int not null check (transit_days >= 0),             -- shipping or road transit
  customs_days        int not null default 0 check (customs_days >= 0),   -- clearance at destination
  total_days          int generated always as (inland_days + port_days + transit_days + customs_days) stored,
  cost_usd_per_tonne  numeric(10,2) check (cost_usd_per_tonne >= 0),
  source              text not null,                                      -- e.g. 'Forwarder quote, Nov 2026'
  updated_at          timestamptz not null default now(),
  unique (from_location_id, to_location_id, mode),
  check (from_location_id <> to_location_id)
);

-- ─────────────────────────────────────────────────────────────
-- 7. Destination certificate rules and sanctions list (must-pass checks, §5.1)
-- ─────────────────────────────────────────────────────────────
create table public.destination_requirements (
  id                   uuid primary key default gen_random_uuid(),
  destination_country  char(2) not null references public.countries(code),
  hs_code              text references public.commodities(hs_code),   -- null = applies to all products
  certificate          text not null,                                  -- e.g. 'phytosanitary'
  is_mandatory         boolean not null default true,
  source_url           text,
  notes                text,
  unique (destination_country, hs_code, certificate)
);

create table public.sanctions_entries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     char(2),
  list_name   text not null,          -- e.g. 'UN Security Council Consolidated List'
  listed_on   date,
  source_url  text,
  created_at  timestamptz not null default now()
);
create index on public.sanctions_entries (lower(name));

-- ─────────────────────────────────────────────────────────────
-- 8. Deals tracked to delivery, agent and fee recorded (§3.4, §4)
-- ─────────────────────────────────────────────────────────────
alter table public.interests
  add column agent_org_id                  uuid references public.organisations(id) on delete set null,
  add column agent_fee_note                text,                      -- shown to both sides
  add column agreed_quantity_tonnes        numeric(12,2) check (agreed_quantity_tonnes > 0),
  add column agreed_price_usd_per_tonne    numeric(12,2) check (agreed_price_usd_per_tonne > 0),
  add column estimated_arrival             date,
  add column shipped_at                    timestamptz,
  add column seller_confirmed_delivery_at  timestamptz,
  add column buyer_confirmed_delivery_at   timestamptz,
  add column updated_at                    timestamptz not null default now();
create index on public.interests (agent_org_id);

-- After delivery, both sides rate each other (§4)
create table public.ratings (
  id                    uuid primary key default gen_random_uuid(),
  deal_id               uuid not null references public.interests(id) on delete cascade,
  rater_org_id          uuid not null references public.organisations(id) on delete cascade,
  rated_org_id          uuid not null references public.organisations(id) on delete cascade,
  on_time               boolean not null,
  quality_as_described  boolean not null,
  stars                 int not null check (stars between 1 and 5),
  comment               text,
  created_at            timestamptz not null default now(),
  unique (deal_id, rater_org_id),
  check (rater_org_id <> rated_org_id)
);
create index on public.ratings (rated_org_id);

-- ─────────────────────────────────────────────────────────────
-- 9. Field visits by OXL field officers or partners (§7.1)
-- ─────────────────────────────────────────────────────────────
create table public.field_visits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  visit_date     date not null,
  visitor_name   text not null,
  location_text  text,
  lat            numeric(9,6),
  lon            numeric(9,6),
  outcome        text not null check (outcome in ('confirmed', 'concerns', 'not_found')),
  findings       text,
  photo_paths    text[] not null default '{}',
  recorded_by    uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index on public.field_visits (org_id);

-- ─────────────────────────────────────────────────────────────
-- 10. Partner memberships: a business says it is a member; the partner confirms (§2, §7.3)
-- ─────────────────────────────────────────────────────────────
create table public.partner_members (
  partner_org_id  uuid not null references public.organisations(id) on delete cascade,
  member_org_id   uuid not null references public.organisations(id) on delete cascade,
  confirmed       boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (partner_org_id, member_org_id),
  check (partner_org_id <> member_org_id)
);

-- ─────────────────────────────────────────────────────────────
-- 11. Prospects found by AI, not yet on OXL (§6)
-- ─────────────────────────────────────────────────────────────
create table public.prospects (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  role                   public.org_role,
  country                char(2) references public.countries(code),
  city                   text,
  hs_codes               text[] not null default '{}',
  website                text,
  public_contact         text,               -- published business contact only, never personal data
  source                 text not null,      -- e.g. 'GEPA exporter directory'
  source_url             text,
  fit_score              int check (fit_score between 0 and 100),
  fit_reasons            jsonb,
  status                 text not null default 'new'
                           check (status in ('new', 'reviewed', 'invited', 'claimed', 'declined', 'opted_out')),
  assigned_agent_org_id  uuid references public.organisations(id) on delete set null,
  invite_token           uuid not null default gen_random_uuid() unique,
  invited_at             timestamptz,
  invited_by             uuid references auth.users(id),
  claimed_org_id         uuid references public.organisations(id) on delete set null,
  opted_out_at           timestamptz,
  notes                  text,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now()
);
create index on public.prospects (status);

-- ─────────────────────────────────────────────────────────────
-- 12. Row-level security for the new tables
-- ─────────────────────────────────────────────────────────────
alter table public.settings                  enable row level security;
alter table public.locations                 enable row level security;
alter table public.agent_profiles            enable row level security;
alter table public.agent_clients             enable row level security;
alter table public.routes                    enable row level security;
alter table public.destination_requirements  enable row level security;
alter table public.sanctions_entries         enable row level security;
alter table public.ratings                   enable row level security;
alter table public.field_visits              enable row level security;
alter table public.partner_members           enable row level security;
alter table public.prospects                 enable row level security;

-- Reference data: everyone signed in reads; OXL admins maintain
create policy settings_read  on public.settings  for select to authenticated using (true);
create policy settings_admin on public.settings  for all    to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());
create policy locations_read on public.locations for select to authenticated using (true);
create policy locations_admin on public.locations for all   to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());
create policy routes_read    on public.routes    for select to authenticated using (true);
create policy routes_admin   on public.routes    for all    to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());
create policy destreq_read   on public.destination_requirements for select to authenticated using (true);
create policy destreq_admin  on public.destination_requirements for all to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());

-- Sanctions list: OXL staff only (screening runs inside security-definer functions)
create policy sanctions_admin on public.sanctions_entries for all to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());

-- Agent profiles: public part of the directory; the agent edits its own
create policy agent_profiles_read  on public.agent_profiles for select to authenticated using (true);
create policy agent_profiles_write on public.agent_profiles for all to authenticated
  using (org_id = public.my_org_id() or public.is_oxl_admin())
  with check ((org_id = public.my_org_id() and public.my_org_role() = 'agent') or public.is_oxl_admin());

-- Agent ↔ client links: the agent, the client and OXL staff see them
create policy agent_clients_read on public.agent_clients for select to authenticated
  using (agent_org_id = public.my_org_id() or client_org_id = public.my_org_id() or public.is_oxl_admin());
-- A client links itself to an agent (consent in the app); agents onboarding new
-- clients will use a dedicated function in week 2.
create policy agent_clients_client_insert on public.agent_clients for insert to authenticated
  with check (client_org_id = public.my_org_id() and public.org_role_of(agent_org_id) = 'agent' and consent_method = 'in_app');
create policy agent_clients_update on public.agent_clients for update to authenticated
  using (agent_org_id = public.my_org_id() or client_org_id = public.my_org_id() or public.is_oxl_admin())
  with check (agent_org_id = public.my_org_id() or client_org_id = public.my_org_id() or public.is_oxl_admin());

-- Ratings: the two sides, OXL, and anyone allowed to see the rated firm's trust report
create policy ratings_read on public.ratings for select to authenticated
  using (rater_org_id = public.my_org_id() or rated_org_id = public.my_org_id() or public.is_oxl_admin()
         or public.can_view_report(rated_org_id));
create policy ratings_insert on public.ratings for insert to authenticated
  with check (
    rater_org_id = public.my_org_id()
    and exists (
      select 1 from public.interests i
      join public.offers o   on o.id = i.offer_id
      join public.requests r on r.id = i.request_id
      where i.id = deal_id
        and i.status in ('delivered', 'completed')
        and ((o.org_id = public.my_org_id() and r.org_id = rated_org_id)
          or (r.org_id = public.my_org_id() and o.org_id = rated_org_id))));

-- Field visits: recorded by OXL staff; visible like the trust report
create policy field_visits_read  on public.field_visits for select to authenticated using (public.can_view_report(org_id));
create policy field_visits_admin on public.field_visits for all to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());

-- Partner memberships: member declares, partner confirms, either side can remove
create policy partner_members_read on public.partner_members for select to authenticated
  using (partner_org_id = public.my_org_id() or member_org_id = public.my_org_id() or public.is_oxl_admin());
create policy partner_members_insert on public.partner_members for insert to authenticated
  with check (member_org_id = public.my_org_id() and not confirmed and public.org_role_of(partner_org_id) = 'partner');
create policy partner_members_confirm on public.partner_members for update to authenticated
  using (partner_org_id = public.my_org_id() or public.is_oxl_admin())
  with check (partner_org_id = public.my_org_id() or public.is_oxl_admin());
create policy partner_members_delete on public.partner_members for delete to authenticated
  using (partner_org_id = public.my_org_id() or member_org_id = public.my_org_id() or public.is_oxl_admin());

-- Prospects: OXL staff manage all; an assigned agent sees and updates its own
create policy prospects_admin on public.prospects for all to authenticated using (public.is_oxl_admin()) with check (public.is_oxl_admin());
create policy prospects_agent_read on public.prospects for select to authenticated
  using (assigned_agent_org_id = public.my_org_id() and public.my_org_role() = 'agent');
create policy prospects_agent_update on public.prospects for update to authenticated
  using (assigned_agent_org_id = public.my_org_id() and public.my_org_role() = 'agent')
  with check (assigned_agent_org_id = public.my_org_id() and status in ('reviewed', 'invited', 'declined'));

-- ─────────────────────────────────────────────────────────────
-- 13. Updated rules on existing tables so agents can act for consenting clients
-- ─────────────────────────────────────────────────────────────
-- Documents: an active agent may upload for a client; may read only if the client allows it
drop policy documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (public.can_view_report(org_id) or public.agent_can_view_documents(org_id));
drop policy documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check ((org_id = public.my_org_id() or public.is_active_agent_of(org_id)) and review_status = 'pending');

drop policy "org uploads own documents" on storage.objects;
create policy "org or agent uploads documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (
    (storage.foldername(name))[1] = public.my_org_id()::text
    or public.is_active_agent_of(((storage.foldername(name))[1])::uuid)));
drop policy "org, admins and shared financiers read documents" on storage.objects;
create policy "read documents: org, admins, financiers, agents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    public.can_view_report(((storage.foldername(name))[1])::uuid)
    or public.agent_can_view_documents(((storage.foldername(name))[1])::uuid)));

-- Offers and requests: agents can post and manage listings for their active clients
drop policy offers_read on public.offers;
create policy offers_read on public.offers for select to authenticated
  using (status = 'open' or org_id = public.my_org_id() or public.is_active_agent_of(org_id) or public.is_oxl_admin());
drop policy offers_write on public.offers;
create policy offers_write on public.offers for all to authenticated
  using (org_id = public.my_org_id() or public.is_active_agent_of(org_id))
  with check (public.org_role_of(org_id) = 'exporter'
              and (org_id = public.my_org_id() or public.is_active_agent_of(org_id)));

drop policy requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated
  using (status = 'open' or org_id = public.my_org_id() or public.is_active_agent_of(org_id) or public.is_oxl_admin());
drop policy requests_write on public.requests;
create policy requests_write on public.requests for all to authenticated
  using (org_id = public.my_org_id() or public.is_active_agent_of(org_id))
  with check (public.org_role_of(org_id) = 'importer'
              and (org_id = public.my_org_id() or public.is_active_agent_of(org_id)));

-- Deals: the agent who introduced a deal can see it and follow it up
drop policy interests_read on public.interests;
create policy interests_read on public.interests for select to authenticated
  using (
    public.is_oxl_admin()
    or agent_org_id = public.my_org_id()
    or exists (select 1 from public.offers o   where o.id = offer_id   and (o.org_id = public.my_org_id() or public.is_active_agent_of(o.org_id)))
    or exists (select 1 from public.requests r where r.id = request_id and (r.org_id = public.my_org_id() or public.is_active_agent_of(r.org_id)))
  );
drop policy interests_insert on public.interests;
create policy interests_insert on public.interests for insert to authenticated
  with check (
    initiated_by = public.my_org_id() and status = 'proposed' and (
      -- a buyer or seller expressing interest for itself (no agent recorded)
      (agent_org_id is null and (
        exists (select 1 from public.offers o   where o.id = offer_id   and o.org_id = public.my_org_id())
        or exists (select 1 from public.requests r where r.id = request_id and r.org_id = public.my_org_id())))
      -- an agent introducing a deal for one of its active clients
      or (agent_org_id = public.my_org_id() and public.my_org_role() = 'agent' and (
        exists (select 1 from public.offers o   where o.id = offer_id   and public.is_active_agent_of(o.org_id))
        or exists (select 1 from public.requests r where r.id = request_id and public.is_active_agent_of(r.org_id))))
    )
  );
drop policy interests_update on public.interests;
create policy interests_update on public.interests for update to authenticated
  using (
    public.is_oxl_admin()
    or exists (select 1 from public.offers o   where o.id = offer_id   and o.org_id = public.my_org_id())
    or exists (select 1 from public.requests r where r.id = request_id and r.org_id = public.my_org_id())
  );

grant execute on function public.org_role_of(uuid), public.is_active_agent_of(uuid),
  public.agent_can_view_documents(uuid) to authenticated;
