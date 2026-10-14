-- OXL Trade Facilitation Platform — MVP core schema
-- Pilot countries: Kenya (KE) and Ghana (GH). Other African countries allowed as counterparties.
-- Run with: npx supabase db push   (or paste into the Supabase SQL editor)

-- ─────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────
create type public.org_role as enum ('exporter', 'importer', 'financier', 'partner');

-- 0 self-declared → 1 documents checked → 2 registry checked → 3 field verified
create type public.verification_tier as enum ('self_declared', 'documents_checked', 'registry_checked', 'field_verified');

create type public.doc_type as enum (
  'business_registration', 'export_licence', 'tax_certificate',
  'quality_certificate', 'phytosanitary_certificate', 'invoice', 'other'
);

create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.listing_status as enum ('open', 'closed');
create type public.interest_status as enum ('proposed', 'accepted', 'declined', 'completed');

-- ─────────────────────────────────────────────────────────────
-- Reference data
-- ─────────────────────────────────────────────────────────────
create table public.countries (
  code        char(2) primary key,
  name        text not null,
  is_african  boolean not null default true,
  is_pilot    boolean not null default false
);

create table public.commodities (
  hs_code  text primary key,          -- HS 4- or 6-digit code
  name     text not null
);

-- ─────────────────────────────────────────────────────────────
-- Organisations and people
-- ─────────────────────────────────────────────────────────────
create table public.organisations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  role               public.org_role not null,
  country            char(2) not null references public.countries(code),
  city               text,
  registration_no    text,
  year_established   int check (year_established between 1900 and 2100),
  description        text,
  hs_codes           text[] not null default '{}',   -- commodities traded
  verification_tier  public.verification_tier not null default 'self_declared',
  is_demo            boolean not null default false, -- seeded demo data, never real firms
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid references public.organisations(id) on delete set null,
  full_name     text,
  phone         text,
  is_oxl_admin  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Verification log: every tier change is recorded with who did it and how
create table public.verifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  tier         public.verification_tier not null,
  method       text not null,          -- e.g. 'document review', 'BRS registry search', 'site visit'
  notes        text,
  verified_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id) on delete cascade,
  doc_type           public.doc_type not null,
  file_name          text not null,
  storage_path       text not null,          -- path inside the 'documents' storage bucket
  extracted          jsonb,                  -- AI-extracted fields (see edge function extract-document)
  extraction_status  text not null default 'not_started' check (extraction_status in ('not_started','processing','done','failed')),
  review_status      public.review_status not null default 'pending',
  review_notes       text,
  reviewed_by        uuid references auth.users(id),
  uploaded_by        uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Marketplace
-- ─────────────────────────────────────────────────────────────
create table public.offers (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organisations(id) on delete cascade,
  hs_code               text not null references public.commodities(hs_code),
  grade                 text,
  quantity_tonnes       numeric(12,2) not null check (quantity_tonnes > 0),
  price_usd_per_tonne   numeric(12,2) check (price_usd_per_tonne > 0),
  incoterm              text check (incoterm in ('EXW','FCA','FOB','CFR','CIF','DAP','DDP')),
  origin_country        char(2) not null references public.countries(code),
  available_from        date,
  notes                 text,
  status                public.listing_status not null default 'open',
  created_at            timestamptz not null default now()
);

create table public.requests (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organisations(id) on delete cascade,
  hs_code               text not null references public.commodities(hs_code),
  grade                 text,
  quantity_tonnes       numeric(12,2) not null check (quantity_tonnes > 0),
  target_price_usd_per_tonne numeric(12,2) check (target_price_usd_per_tonne > 0),
  incoterm              text check (incoterm in ('EXW','FCA','FOB','CFR','CIF','DAP','DDP')),
  destination_country   char(2) not null references public.countries(code),
  needed_by             date,
  notes                 text,
  status                public.listing_status not null default 'open',
  created_at            timestamptz not null default now()
);

-- An expression of interest between an offer and a request
create table public.interests (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references public.offers(id) on delete cascade,
  request_id    uuid not null references public.requests(id) on delete cascade,
  initiated_by  uuid not null references public.organisations(id) on delete cascade,
  message       text,
  match_score   int,
  status        public.interest_status not null default 'proposed',
  created_at    timestamptz not null default now(),
  unique (offer_id, request_id)
);

-- A trader asks for trade finance; financiers browse these
create table public.finance_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  amount_usd   numeric(14,2) not null check (amount_usd > 0),
  purpose      text not null,
  offer_id     uuid references public.offers(id) on delete set null,
  request_id   uuid references public.requests(id) on delete set null,
  status       public.listing_status not null default 'open',
  created_at   timestamptz not null default now()
);

-- Consent: an organisation shares its risk report with a specific financier
create table public.report_shares (
  org_id              uuid not null references public.organisations(id) on delete cascade,
  shared_with_org_id  uuid not null references public.organisations(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (org_id, shared_with_org_id)
);

create index on public.offers (hs_code) where status = 'open';
create index on public.requests (hs_code) where status = 'open';
create index on public.documents (org_id);
create index on public.interests (request_id);
create index on public.interests (offer_id);

-- ─────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER so RLS policies can call them without recursion)
-- ─────────────────────────────────────────────────────────────
create or replace function public.my_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_oxl_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_oxl_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.my_org_role() returns public.org_role
language sql stable security definer set search_path = public as $$
  select o.role from public.organisations o
  join public.profiles p on p.org_id = o.id
  where p.id = auth.uid()
$$;

-- Can the current user see this organisation's full risk report?
create or replace function public.can_view_report(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_oxl_admin()
      or p_org_id = public.my_org_id()
      or exists (select 1 from public.report_shares s
                 where s.org_id = p_org_id and s.shared_with_org_id = public.my_org_id())
$$;

-- ─────────────────────────────────────────────────────────────
-- Onboarding: create my organisation and link my profile in one step
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_my_organisation(
  p_name text, p_role public.org_role, p_country char(2), p_city text,
  p_registration_no text, p_year_established int, p_description text,
  p_hs_codes text[], p_full_name text, p_phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and org_id is not null) then
    raise exception 'You already belong to an organisation';
  end if;

  insert into public.organisations (name, role, country, city, registration_no, year_established, description, hs_codes, created_by)
  values (p_name, p_role, p_country, p_city, p_registration_no, p_year_established, p_description, coalesce(p_hs_codes, '{}'), auth.uid())
  returning id into v_org;

  insert into public.profiles (id, org_id, full_name, phone)
  values (auth.uid(), v_org, p_full_name, p_phone)
  on conflict (id) do update set org_id = excluded.org_id, full_name = excluded.full_name, phone = excluded.phone;

  insert into public.verifications (org_id, tier, method, verified_by)
  values (v_org, 'self_declared', 'self registration', auth.uid());

  return v_org;
end $$;

-- Admin-only: set an organisation's verification tier and log it
create or replace function public.set_verification_tier(
  p_org_id uuid, p_tier public.verification_tier, p_method text, p_notes text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL admins can verify organisations'; end if;
  perform set_config('oxl.allow_tier_change', 'on', true);
  update public.organisations set verification_tier = p_tier where id = p_org_id;
  insert into public.verifications (org_id, tier, method, notes, verified_by)
  values (p_org_id, p_tier, p_method, p_notes, auth.uid());
end $$;

-- Block anyone from changing verification_tier except through set_verification_tier()
create or replace function public.guard_verification_tier() returns trigger
language plpgsql as $$
begin
  if new.verification_tier is distinct from old.verification_tier
     and coalesce(current_setting('oxl.allow_tier_change', true), 'off') <> 'on' then
    raise exception 'verification_tier can only be changed by an OXL admin';
  end if;
  return new;
end $$;

create trigger trg_guard_verification_tier
before update on public.organisations
for each row execute function public.guard_verification_tier();

-- Block users from making themselves admin or moving to another org
-- NOT security definer: current_user must be the caller's role (authenticated / service_role)
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.is_oxl_admin is distinct from old.is_oxl_admin or new.org_id is distinct from old.org_id)
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_oxl_admin() then
    raise exception 'Not allowed to change admin flag or organisation';
  end if;
  return new;
end $$;

create trigger trg_guard_profile
before update on public.profiles
for each row execute function public.guard_profile();
