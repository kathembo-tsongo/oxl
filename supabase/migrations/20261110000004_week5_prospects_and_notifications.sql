-- OXL MVP — Week 5 (M5): prospect scoring, invitations (claim / opt-out) and in-app notifications.
-- Prospect scoring here is rule-based; Claude can later add tidying and smarter scoring on top.

-- ─────────────────────────────────────────────────────────────
-- 1. Prospect fit score (0–100), always with reasons (Conceptual Design §6.1, step 3)
--    demand or supply on OXL for their products 40 · a route on record 20 · pilot market 20 · contact 10 · website 10
-- ─────────────────────────────────────────────────────────────
create or replace function public.score_prospect(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p public.prospects; n int := 0; has_route boolean := false; pts int; total int := 0; f jsonb := '[]'::jsonb;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can score prospects'; end if;
  select * into p from public.prospects where id = p_id;
  if not found then raise exception 'Prospect not found'; end if;

  -- Buyers are worth inviting if OXL sellers offer what they buy, and the reverse
  if p.role = 'importer' then
    select count(*) into n from public.offers o where o.status = 'open' and o.hs_code = any (p.hs_codes);
    select exists (select 1 from public.offers o join public.routes r on true
                   join public.locations a on a.id = r.from_location_id join public.locations b on b.id = r.to_location_id
                   where o.status = 'open' and o.hs_code = any (p.hs_codes) and a.country = o.origin_country and b.country = p.country)
      into has_route;
  else
    select count(*) into n from public.requests q where q.status = 'open' and q.hs_code = any (p.hs_codes);
    select exists (select 1 from public.requests q join public.routes r on true
                   join public.locations a on a.id = r.from_location_id join public.locations b on b.id = r.to_location_id
                   where q.status = 'open' and q.hs_code = any (p.hs_codes) and a.country = p.country and b.country = q.destination_country)
      into has_route;
  end if;
  pts := 10 * least(n, 4);
  f := f || jsonb_build_object('factor', 'Fit with OXL listings', 'points', pts, 'max', 40, 'detail',
        n || ' open ' || case when p.role = 'importer' then 'offers' else 'requests' end || ' for their products');
  total := total + pts;

  pts := case when has_route then 20 when p.country in ('KE', 'GH') then 8 else 0 end;
  f := f || jsonb_build_object('factor', 'Route on record', 'points', pts, 'max', 20, 'detail',
        case when has_route then 'OXL has transport times for this corridor' else 'No route on record yet for this corridor' end);
  total := total + pts;

  pts := case when p.country in ('KE', 'GH') then 20 when (select is_african from public.countries where code = p.country) then 10 else 5 end;
  f := f || jsonb_build_object('factor', 'Pilot market', 'points', pts, 'max', 20, 'detail',
        case when p.country in ('KE', 'GH') then 'In the Kenya–Ghana pilot' else coalesce(p.country, 'Unknown country') || ', outside the pilot' end);
  total := total + pts;

  pts := case when coalesce(p.public_contact, '') <> '' then 10 else 0 end;
  f := f || jsonb_build_object('factor', 'Published contact', 'points', pts, 'max', 10, 'detail', case when pts > 0 then 'Business contact available' else 'No published contact' end);
  total := total + pts;

  pts := case when coalesce(p.website, '') <> '' then 10 else 0 end;
  f := f || jsonb_build_object('factor', 'Website', 'points', pts, 'max', 10, 'detail', case when pts > 0 then 'Has a website' else 'No website found' end);
  total := total + pts;

  update public.prospects set fit_score = total, fit_reasons = f where id = p_id;
  return total;
end $$;

create or replace function public.score_all_prospects() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can score prospects'; end if;
  for r in select id from public.prospects where status in ('new', 'reviewed', 'invited') loop
    perform public.score_prospect(r.id); n := n + 1;
  end loop;
  return n;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Invitations: a business opens its personal link, then joins (claim) or opts out (deleted)
-- ─────────────────────────────────────────────────────────────
create or replace function public.prospect_invite_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'country', country, 'status', status)
  from public.prospects where invite_token = p_token and status in ('invited', 'reviewed', 'new')
$$;

create or replace function public.prospect_opt_out(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.prospects where invite_token = p_token and status <> 'claimed';
  return found;
end $$;

create or replace function public.claim_prospect(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if public.my_org_id() is null then raise exception 'Create your profile first'; end if;
  update public.prospects set status = 'claimed', claimed_org_id = public.my_org_id()
  where invite_token = p_token and status <> 'claimed';
  return found;
end $$;

grant execute on function public.prospect_invite_info(uuid), public.prospect_opt_out(uuid) to anon, authenticated;
grant execute on function public.claim_prospect(uuid), public.score_prospect(uuid), public.score_all_prospects() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. In-app notifications
-- ─────────────────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (org_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using (org_id = public.my_org_id());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy notifications_delete on public.notifications for delete to authenticated using (org_id = public.my_org_id());

create or replace function public.notify(p_org uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (org_id, title, body, link) select p_org, p_title, p_body, p_link where p_org is not null
$$;
revoke execute on function public.notify(uuid, text, text, text) from public, anon, authenticated;

-- Deals: new interest, and every change of status, to both sides and the agent
create or replace function public.trg_notify_deal() returns trigger
language plpgsql security definer set search_path = public as $$
declare seller uuid; buyer uuid; commodity text; s_name text; b_name text; label text;
begin
  select o.org_id, c.name into seller, commodity from public.offers o join public.commodities c on c.hs_code = o.hs_code where o.id = new.offer_id;
  select org_id into buyer from public.requests where id = new.request_id;
  select name into s_name from public.organisations where id = seller;
  select name into b_name from public.organisations where id = buyer;
  if tg_op = 'INSERT' then
    if new.initiated_by <> seller then perform public.notify(seller, 'New interest in your ' || commodity, b_name || ' is interested. Please reply.', '/'); end if;
    if new.initiated_by <> buyer  then perform public.notify(buyer,  'New offer of ' || commodity, s_name || ' is interested in your request. Please reply.', '/'); end if;
  elsif new.status is distinct from old.status then
    label := replace(new.status::text, '_', ' ');
    perform public.notify(seller, commodity || ' deal with ' || b_name || ': ' || label, null, '/');
    perform public.notify(buyer,  commodity || ' deal with ' || s_name || ': ' || label, null, '/');
    perform public.notify(new.agent_org_id, commodity || ' deal ' || s_name || ' → ' || b_name || ': ' || label, null, '/');
  end if;
  return new;
end $$;
create trigger trg_notify_deal after insert or update on public.interests for each row execute function public.trg_notify_deal();

-- A seller's ready date changes: alert buyers in open deals, with the new estimated arrival (user story B5)
create or replace function public.trg_notify_ready_date() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record; v_arrival date;
begin
  if new.available_from is distinct from old.available_from then
    for d in select i.id as deal_id, q.id as req_id, q.org_id as buyer, q.needed_by from public.interests i join public.requests q on q.id = i.request_id
             where i.offer_id = new.id and i.status in ('proposed', 'accepted') loop
      v_arrival := (public.evaluate_pair(new, (select q2 from public.requests q2 where q2.id = d.req_id))->>'est_arrival')::date;
      perform public.notify(d.buyer, 'Ready date changed by ' || (select name from public.organisations where id = new.org_id),
        'Goods now ready ' || coalesce(to_char(new.available_from, 'DD Mon YYYY'), 'date not set')
        || coalesce('; estimated arrival ' || to_char(v_arrival, 'DD Mon YYYY'), '')
        || case when d.needed_by is not null and v_arrival is not null and v_arrival > d.needed_by then '. This is after your deadline.' else '.' end, '/');
      update public.interests set estimated_arrival = v_arrival where id = d.deal_id and status = 'accepted';
    end loop;
  end if;
  return new;
end $$;
create trigger trg_notify_ready_date after update on public.offers for each row execute function public.trg_notify_ready_date();

-- Verification level changed, document reviewed
create or replace function public.trg_notify_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.method not in ('self registration', 'onboarded by agent', 'demo seed') then
    perform public.notify(new.org_id, 'Your verification level is now ' || replace(new.tier::text, '_', ' '), new.method, '/profile');
  end if;
  return new;
end $$;
create trigger trg_notify_verification after insert on public.verifications for each row execute function public.trg_notify_verification();

create or replace function public.trg_notify_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.review_status is distinct from old.review_status and new.review_status in ('approved', 'rejected') then
    perform public.notify(new.org_id, 'Document ' || new.review_status || ': ' || new.file_name, new.review_notes, '/documents');
  end if;
  return new;
end $$;
create trigger trg_notify_document after update on public.documents for each row execute function public.trg_notify_document();

-- Consent and membership requests
create or replace function public.trg_notify_agent_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.consent_method = 'in_app' then
    perform public.notify(new.agent_org_id, (select name from public.organisations where id = new.client_org_id) || ' gave you consent to act for it', null, '/');
  elsif tg_op = 'UPDATE' and new.withdrawn_at is not null and old.withdrawn_at is null then
    perform public.notify(new.agent_org_id, (select name from public.organisations where id = new.client_org_id) || ' withdrew its consent', 'You can no longer act for this client.', '/');
  end if;
  return new;
end $$;
create trigger trg_notify_agent_client after insert or update on public.agent_clients for each row execute function public.trg_notify_agent_client();

create or replace function public.trg_notify_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.partner_org_id, (select name from public.organisations where id = new.member_org_id) || ' says it is your member', 'Please confirm or decline.', '/');
  return new;
end $$;
create trigger trg_notify_membership after insert on public.partner_members for each row execute function public.trg_notify_membership();
