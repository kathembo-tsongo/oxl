-- OXL MVP — Richmond's review, deal order (comment on wireframe page 14)
--   In international trade the buyer makes the offer and the seller accepts, subject to terms.
--   1. Only the buyer's side can propose a deal. A seller invites a buyer to make an offer instead.
--   2. The seller replies: accept, accept subject to terms, or decline.
--   3. advance_deal() lets an agent act for the client it represents (it only recognised the client itself before).
-- Table names stay as they are: `offers` is the exporter's supply listing, `requests` is the importer's purchase offer.

alter table public.interests
  add column if not exists proposed_by_side text check (proposed_by_side in ('buyer', 'seller')),
  add column if not exists seller_terms text;

-- ─────────────────────────────────────────────────────────────
-- 1. Only the buyer's side can propose a deal
--    Deals created before this change keep proposed_by_side empty and follow the old rule.
-- ─────────────────────────────────────────────────────────────
create or replace function public.trg_interest_buyer_first() returns trigger
language plpgsql security definer set search_path = public as $$
declare o_org uuid; r_org uuid; buyer_side boolean;
begin
  select org_id into o_org from public.offers where id = new.offer_id;
  select org_id into r_org from public.requests where id = new.request_id;
  if auth.uid() is null then  -- seed data and service-role scripts
    new.proposed_by_side := case when new.initiated_by = r_org then 'buyer'
                                 when new.initiated_by = o_org then 'seller'
                                 else new.proposed_by_side end;
    return new;
  end if;
  buyer_side := new.initiated_by = r_org
    or (new.agent_org_id is not null and new.initiated_by = new.agent_org_id
        and coalesce(public.is_active_agent_of(r_org), false));
  if not coalesce(buyer_side, false) then
    raise exception 'Only the buyer can propose a deal. As a seller, invite the buyer to make an offer.';
  end if;
  new.proposed_by_side := 'buyer';
  return new;
end $$;

drop trigger if exists trg_interest_buyer_first on public.interests;
create trigger trg_interest_buyer_first before insert on public.interests
  for each row execute function public.trg_interest_buyer_first();

-- ─────────────────────────────────────────────────────────────
-- 2. A seller invites a matching buyer to make an offer (a notification, not a deal)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.deal_invitations (
  id                 uuid primary key default gen_random_uuid(),
  offer_id           uuid not null references public.offers(id) on delete cascade,
  request_id         uuid not null references public.requests(id) on delete cascade,
  invited_by_org_id  uuid not null references public.organisations(id) on delete cascade,
  invited_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (offer_id, request_id)
);
alter table public.deal_invitations enable row level security;
create policy deal_invitations_read on public.deal_invitations for select to authenticated
  using (public.can_act_for(invited_by_org_id)
         or public.can_act_for((select q.org_id from public.requests q where q.id = deal_invitations.request_id))
         or public.is_oxl_admin());
-- no insert/update/delete policies: invitations are created by invite_to_offer()

create or replace function public.invite_to_offer(p_offer_id uuid, p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare o public.offers; r public.requests; seller_name text; commodity text; n int;
begin
  select * into o from public.offers where id = p_offer_id;
  if not found then raise exception 'Supply listing not found'; end if;
  select * into r from public.requests where id = p_request_id;
  if not found then raise exception 'Purchase offer not found'; end if;
  if not public.can_act_for(o.org_id) then raise exception 'You can only invite buyers for your own supply listings'; end if;
  if o.status <> 'open' or r.status <> 'open' then raise exception 'Both listings must be open'; end if;
  if o.org_id = r.org_id or not coalesce((public.evaluate_pair(o, r) ->> 'passed')::boolean, false) then
    raise exception 'This buyer does not pass the checks for your listing';
  end if;
  if exists (select 1 from public.interests i where i.offer_id = o.id and i.request_id = r.id) then return false; end if;

  insert into public.deal_invitations (offer_id, request_id, invited_by_org_id, invited_by)
  values (o.id, r.id, o.org_id, auth.uid())
  on conflict (offer_id, request_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;

  select name into seller_name from public.organisations where id = o.org_id;
  select name into commodity from public.commodities where hs_code = o.hs_code;
  perform public.notify(r.org_id, 'A seller invites your purchase offer',
    coalesce(seller_name, 'A seller') || ' can supply ' || coalesce(commodity, 'this commodity') || ' and invites you to make an offer.', '/');
  return true;
end $$;
revoke execute on function public.invite_to_offer(uuid, uuid) from public, anon;
grant execute on function public.invite_to_offer(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Deals move step by step, only through this function
--    proposed → accepted (optionally with the seller's terms) → in_transit → delivered → completed
--    New: the third argument carries the seller's terms; an agent can act for the client it represents.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.advance_deal(uuid, text);
create or replace function public.advance_deal(p_deal_id uuid, p_action text, p_terms text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  d public.interests; o public.offers; r public.requests;
  me uuid := public.my_org_id(); is_seller boolean; is_buyer boolean;
begin
  select * into d from public.interests where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  select * into o from public.offers where id = d.offer_id;
  select * into r from public.requests where id = d.request_id;
  is_seller := coalesce(me = o.org_id, false) or coalesce(public.is_active_agent_of(o.org_id), false);
  is_buyer  := coalesce(me = r.org_id, false) or coalesce(public.is_active_agent_of(r.org_id), false);
  if not (is_seller or is_buyer or public.is_oxl_admin()) then raise exception 'Only the buyer or the seller can update this deal'; end if;

  if p_action in ('accept', 'decline') then
    if d.status <> 'proposed' then raise exception 'This deal is no longer waiting for a reply'; end if;
    if d.proposed_by_side = 'buyer' then
      if not (is_seller or public.is_oxl_admin()) then raise exception 'Only the seller can reply to a purchase offer'; end if;
    elsif d.proposed_by_side = 'seller' then
      if not (is_buyer or public.is_oxl_admin()) then raise exception 'Only the buyer can reply to the seller''s proposal'; end if;
    elsif d.initiated_by = me then
      raise exception 'The other side must reply to your proposal';
    end if;
    if p_action = 'accept' then
      update public.interests set status = 'accepted', updated_at = now(),
        seller_terms = case when is_seller then coalesce(nullif(left(trim(p_terms), 1000), ''), seller_terms) else seller_terms end,
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
revoke execute on function public.advance_deal(uuid, text, text) from public, anon;
grant execute on function public.advance_deal(uuid, text, text) to authenticated;
