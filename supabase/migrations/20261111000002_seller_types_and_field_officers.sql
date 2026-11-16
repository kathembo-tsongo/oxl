-- OXL MVP — Richmond's refinements (11 Nov 2026)
--   A. Seller types: individual, registered enterprise, cooperative / farmer group, trader / broker,
--      and offers of goods that belong to someone else (a producer), with a commission.
--   B. OXL field officers: area-based OXL members who onboard farmers themselves and also
--      lead a network of agents; deals their agents introduce are attributed to them.

-- ─────────────────────────────────────────────────────────────
-- A1. How a business trades
-- ─────────────────────────────────────────────────────────────
alter table public.organisations
  add column entity_type text check (entity_type in ('individual', 'enterprise', 'cooperative', 'trader'));
comment on column public.organisations.entity_type is
  'individual = sells own produce; enterprise = registered business; cooperative = farmer group selling members'' goods; trader = buys or sells produce belonging to others for a commission';

-- A2. Producers a trader or cooperative sells for (on OXL or not), with recorded consent
create table public.seller_producers (
  id               uuid primary key default gen_random_uuid(),
  seller_org_id    uuid not null references public.organisations(id) on delete cascade,
  producer_org_id  uuid references public.organisations(id) on delete set null,   -- producer that is on OXL
  producer_name    text,                                                          -- or a producer not on OXL
  producer_phone   text,
  producer_town    text,
  consent_method   text not null check (consent_method in ('in_app', 'signed_form', 'recorded_verbal')),
  consent_note     text,
  commission_pct   numeric(5,2) check (commission_pct >= 0 and commission_pct <= 50),
  withdrawn_at     timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  check (producer_org_id is not null or coalesce(trim(producer_name), '') <> ''),
  check (producer_org_id is null or producer_org_id <> seller_org_id)
);
create index on public.seller_producers (seller_org_id);
create index on public.seller_producers (producer_org_id);
create unique index seller_producers_once on public.seller_producers (seller_org_id, producer_org_id)
  where producer_org_id is not null and withdrawn_at is null;

alter table public.seller_producers enable row level security;
create policy seller_producers_read on public.seller_producers for select to authenticated
  using (seller_org_id = public.my_org_id() or producer_org_id = public.my_org_id()
         or public.is_active_agent_of(seller_org_id) or public.is_oxl_admin());
-- The seller (or its agent) records a producer it sells for. A producer on OXL that the seller
-- links itself can only be linked with the producer's own in-app consent (next policy).
create policy seller_producers_seller_insert on public.seller_producers for insert to authenticated
  with check ((seller_org_id = public.my_org_id() or public.is_active_agent_of(seller_org_id))
              and producer_org_id is null and consent_method in ('signed_form', 'recorded_verbal'));
-- A producer on OXL authorises a trader or cooperative to sell its goods
create policy seller_producers_producer_insert on public.seller_producers for insert to authenticated
  with check (producer_org_id = public.my_org_id() and consent_method = 'in_app');
create policy seller_producers_update on public.seller_producers for update to authenticated
  using (seller_org_id = public.my_org_id() or producer_org_id = public.my_org_id()
         or public.is_active_agent_of(seller_org_id) or public.is_oxl_admin());

-- Consent that was withdrawn cannot be quietly restored; the link itself cannot be rewritten
create or replace function public.guard_seller_producer() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or public.is_oxl_admin() then
    return new;
  end if;
  if old.withdrawn_at is not null and new.withdrawn_at is null then
    raise exception 'Withdrawn consent cannot be restored; add the producer again';
  end if;
  if new.seller_org_id <> old.seller_org_id or new.producer_org_id is distinct from old.producer_org_id
     or new.consent_method <> old.consent_method or new.created_at <> old.created_at then
    raise exception 'Consent records cannot be rewritten';
  end if;
  -- only the producer may change the commission it agreed to, once linked on OXL
  if new.commission_pct is distinct from old.commission_pct and old.producer_org_id is not null
     and public.my_org_id() <> old.producer_org_id then
    raise exception 'Only the producer can change the agreed commission';
  end if;
  return new;
end $$;
create trigger trg_guard_seller_producer before update on public.seller_producers
for each row execute function public.guard_seller_producer();

-- A3. Whose goods an offer is
alter table public.offers
  add column goods_owner          text not null default 'own' check (goods_owner in ('own', 'producer')),
  add column seller_producer_id   uuid references public.seller_producers(id) on delete set null,
  add column goods_owner_name     text,            -- filled from the producer link; shown to buyers
  add column commission_pct       numeric(5,2) check (commission_pct >= 0 and commission_pct <= 50);

create or replace function public.check_offer_goods_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare sp public.seller_producers;
begin
  if new.goods_owner = 'own' then
    new.seller_producer_id := null; new.goods_owner_name := null; new.commission_pct := null;
    return new;
  end if;
  if new.seller_producer_id is null then
    raise exception 'Choose the producer whose goods these are';
  end if;
  select * into sp from public.seller_producers where id = new.seller_producer_id;
  if not found or sp.seller_org_id <> new.org_id then
    raise exception 'That producer is not linked to this seller';
  end if;
  if sp.withdrawn_at is not null and new.status = 'open' then
    raise exception 'The producer has withdrawn consent; you can no longer sell its goods';
  end if;
  new.goods_owner_name := coalesce((select name from public.organisations where id = sp.producer_org_id), sp.producer_name);
  new.commission_pct := coalesce(new.commission_pct, sp.commission_pct);
  return new;
end $$;
create trigger trg_check_offer_goods_owner before insert or update on public.offers
for each row execute function public.check_offer_goods_owner();

-- A producer withdrawing consent closes the open offers of its goods
create or replace function public.trg_producer_withdrawn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.offers set status = 'closed' where seller_producer_id = new.id and status = 'open';
    perform public.notify(new.seller_org_id, 'Producer consent withdrawn',
      coalesce(new.producer_name, (select name from public.organisations where id = new.producer_org_id))
      || ' withdrew consent. Offers of its goods were closed.', '/profile');
  end if;
  return new;
end $$;
create trigger trg_producer_withdrawn after update on public.seller_producers
for each row execute function public.trg_producer_withdrawn();

create or replace function public.trg_notify_producer_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.producer_org_id is not null then
    perform public.notify(new.seller_org_id, 'New producer linked',
      (select name from public.organisations where id = new.producer_org_id) || ' authorised you to sell its goods.', '/profile');
  end if;
  return new;
end $$;
create trigger trg_notify_producer_link after insert on public.seller_producers
for each row execute function public.trg_notify_producer_link();

-- Agents can onboard a client with its trading type too
create or replace function public.agent_set_client_entity_type(p_org uuid, p_entity_type text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_active_agent_of(p_org) or p_org = public.my_org_id() or public.is_oxl_admin()) then
    raise exception 'Not allowed';
  end if;
  update public.organisations set entity_type = p_entity_type where id = p_org;
end $$;
grant execute on function public.agent_set_client_entity_type(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- B1. OXL field officers (an agent organisation flagged by OXL staff, tied to an area)
-- ─────────────────────────────────────────────────────────────
alter table public.agent_profiles
  add column is_field_officer  boolean not null default false,
  add column field_area        text;           -- e.g. 'Nairobi'

create or replace function public.guard_field_officer_flag() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or public.is_oxl_admin() then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.is_field_officer or new.field_area is not null))
     or (tg_op = 'UPDATE' and (new.is_field_officer is distinct from old.is_field_officer
                               or new.field_area is distinct from old.field_area)) then
    raise exception 'Only OXL staff can appoint field officers and set their area';
  end if;
  return new;
end $$;
create trigger trg_guard_field_officer before insert or update on public.agent_profiles
for each row execute function public.guard_field_officer_flag();

create or replace function public.is_field_officer(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agent_profiles ap join public.organisations o on o.id = ap.org_id
                 where ap.org_id = p_org and ap.is_field_officer and o.role = 'agent' and not o.is_suspended)
$$;

-- B2. A field officer's network of agents (one active officer per agent)
create table public.agent_networks (
  officer_org_id     uuid not null references public.organisations(id) on delete cascade,
  agent_org_id       uuid not null references public.organisations(id) on delete cascade,
  status             text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  requested_by       uuid not null references public.organisations(id),
  officer_share_note text,                       -- e.g. '0.5% of deal value, from the agent fee'
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  ended_at           timestamptz,
  primary key (officer_org_id, agent_org_id),
  check (officer_org_id <> agent_org_id)
);
create unique index agent_networks_one_active on public.agent_networks (agent_org_id) where status = 'active';
alter table public.agent_networks enable row level security;
create policy agent_networks_read on public.agent_networks for select to authenticated
  using (officer_org_id = public.my_org_id() or agent_org_id = public.my_org_id() or public.is_oxl_admin());
-- Changes go through the functions below only
create policy agent_networks_admin on public.agent_networks for all to authenticated
  using (public.is_oxl_admin()) with check (public.is_oxl_admin());

create or replace function public.network_officer_of(p_agent uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select officer_org_id from public.agent_networks where agent_org_id = p_agent and status = 'active' limit 1
$$;

-- Either side asks; the other side confirms
create or replace function public.network_request(p_other uuid, p_share_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_org_id(); v_officer uuid; v_agent uuid;
begin
  if me is null or public.org_role_of(me) <> 'agent' or public.org_role_of(p_other) <> 'agent' then
    raise exception 'Networks link agents and field officers only';
  end if;
  if public.is_field_officer(me) and not public.is_field_officer(p_other) then
    v_officer := me; v_agent := p_other;
  elsif public.is_field_officer(p_other) and not public.is_field_officer(me) then
    v_officer := p_other; v_agent := me;
  else
    raise exception 'One side must be an OXL field officer and the other a regular agent';
  end if;
  if public.network_officer_of(v_agent) is not null then
    raise exception 'This agent already works with a field officer';
  end if;
  insert into public.agent_networks (officer_org_id, agent_org_id, status, requested_by, officer_share_note)
  values (v_officer, v_agent, 'pending', me, p_share_note)
  on conflict (officer_org_id, agent_org_id) do update
    set status = 'pending', requested_by = me, officer_share_note = coalesce(excluded.officer_share_note, agent_networks.officer_share_note),
        created_at = now(), confirmed_at = null, ended_at = null;
  perform public.notify(p_other, 'Agent network request',
    (select name from public.organisations where id = me) || ' asked to work together on OXL.', '/');
  return 'pending';
end $$;

create or replace function public.network_respond(p_officer uuid, p_agent uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare n public.agent_networks; me uuid := public.my_org_id();
begin
  select * into n from public.agent_networks where officer_org_id = p_officer and agent_org_id = p_agent for update;
  if not found or n.status <> 'pending' then raise exception 'No pending request'; end if;
  if me not in (p_officer, p_agent) or me = n.requested_by then
    raise exception 'The other side must reply to this request';
  end if;
  if p_accept then
    if public.network_officer_of(p_agent) is not null then raise exception 'This agent already works with a field officer'; end if;
    update public.agent_networks set status = 'active', confirmed_at = now() where officer_org_id = p_officer and agent_org_id = p_agent;
  else
    update public.agent_networks set status = 'ended', ended_at = now() where officer_org_id = p_officer and agent_org_id = p_agent;
  end if;
  perform public.notify(n.requested_by, case when p_accept then 'Network request accepted' else 'Network request declined' end,
    (select name from public.organisations where id = me) || case when p_accept then ' accepted.' else ' declined.' end, '/');
  return case when p_accept then 'active' else 'ended' end;
end $$;

create or replace function public.network_end(p_officer uuid, p_agent uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_org_id();
begin
  if me not in (p_officer, p_agent) and not public.is_oxl_admin() then raise exception 'Not allowed'; end if;
  update public.agent_networks set status = 'ended', ended_at = now()
  where officer_org_id = p_officer and agent_org_id = p_agent and status in ('pending', 'active');
  return 'ended';
end $$;

-- B3. What a field officer sees: its agents with their results, and all clients in the network
create or replace function public.my_network() returns table (
  agent_org_id uuid, agent_name text, agent_city text, status text, requested_by_me boolean, officer_share_note text,
  clients int, clients_verified int, open_offers int, deals int, deals_completed int)
language sql stable security definer set search_path = public as $$
  select n.agent_org_id, a.name, a.city, n.status, n.requested_by = public.my_org_id(), n.officer_share_note,
    (select count(*)::int from public.agent_clients ac where ac.agent_org_id = n.agent_org_id and ac.withdrawn_at is null),
    (select count(*)::int from public.agent_clients ac join public.organisations c on c.id = ac.client_org_id
       where ac.agent_org_id = n.agent_org_id and ac.withdrawn_at is null and c.verification_tier <> 'self_declared'),
    (select count(*)::int from public.offers o join public.agent_clients ac on ac.client_org_id = o.org_id
       where ac.agent_org_id = n.agent_org_id and ac.withdrawn_at is null and o.status = 'open'),
    (select count(*)::int from public.interests i where i.agent_org_id = n.agent_org_id),
    (select count(*)::int from public.interests i where i.agent_org_id = n.agent_org_id and i.status = 'completed')
  from public.agent_networks n join public.organisations a on a.id = n.agent_org_id
  where n.officer_org_id = public.my_org_id() and n.status in ('pending', 'active') and public.is_field_officer(public.my_org_id())
  order by n.status, a.name
$$;

create or replace function public.network_clients() returns table (
  client_org_id uuid, client_name text, client_city text, client_country char(2), entity_type text,
  verification_tier public.verification_tier, agent_org_id uuid, agent_name text, open_offers int, last_visit date)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.country, c.entity_type, c.verification_tier, ac.agent_org_id, a.name,
    (select count(*)::int from public.offers o where o.org_id = c.id and o.status = 'open'),
    (select max(v.visit_date) from public.field_visits v where v.org_id = c.id)
  from public.agent_clients ac
  join public.organisations c on c.id = ac.client_org_id
  join public.organisations a on a.id = ac.agent_org_id
  where ac.withdrawn_at is null and public.is_field_officer(public.my_org_id())
    and (ac.agent_org_id = public.my_org_id()
         or exists (select 1 from public.agent_networks n where n.officer_org_id = public.my_org_id()
                    and n.agent_org_id = ac.agent_org_id and n.status = 'active'))
  order by a.name, c.name
$$;

grant execute on function public.is_field_officer(uuid), public.network_officer_of(uuid),
  public.network_request(uuid, text), public.network_respond(uuid, uuid, boolean), public.network_end(uuid, uuid),
  public.my_network(), public.network_clients() to authenticated;

-- B4. Field officers record field visits for businesses in their network
--     (the trust level itself is still raised by OXL staff, who see the visit in the history)
create or replace function public.officer_can_visit(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_field_officer(public.my_org_id()) and exists (
    select 1 from public.agent_clients ac
    where ac.client_org_id = p_org and ac.withdrawn_at is null
      and (ac.agent_org_id = public.my_org_id()
           or exists (select 1 from public.agent_networks n where n.officer_org_id = public.my_org_id()
                      and n.agent_org_id = ac.agent_org_id and n.status = 'active')))
$$;
grant execute on function public.officer_can_visit(uuid) to authenticated;

create policy field_visits_officer_read on public.field_visits for select to authenticated
  using (public.officer_can_visit(org_id));
create policy field_visits_officer_insert on public.field_visits for insert to authenticated
  with check (public.officer_can_visit(org_id) and recorded_by = auth.uid());

-- B5. Deals introduced by an agent in a network are attributed to its field officer
alter table public.interests
  add column network_officer_org_id  uuid references public.organisations(id) on delete set null,
  add column officer_share_note      text;

create or replace function public.set_deal_network_officer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agent_org_id is not null and new.network_officer_org_id is null then
    select n.officer_org_id, n.officer_share_note into new.network_officer_org_id, new.officer_share_note
    from public.agent_networks n where n.agent_org_id = new.agent_org_id and n.status = 'active' limit 1;
  end if;
  return new;
end $$;
create trigger trg_set_deal_network_officer before insert on public.interests
for each row execute function public.set_deal_network_officer();

drop policy interests_read on public.interests;
create policy interests_read on public.interests for select to authenticated
  using (
    public.is_oxl_admin()
    or agent_org_id = public.my_org_id()
    or network_officer_org_id = public.my_org_id()
    or exists (select 1 from public.offers o   where o.id = offer_id   and (o.org_id = public.my_org_id() or public.is_active_agent_of(o.org_id)))
    or exists (select 1 from public.requests r where r.id = request_id and (r.org_id = public.my_org_id() or public.is_active_agent_of(r.org_id)))
  );
