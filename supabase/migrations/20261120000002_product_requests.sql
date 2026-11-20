-- "Can't find your product?": any signed-in user can ask OXL to add a product; staff review the requests under Reference data.
create table if not exists public.product_requests (
  id           uuid primary key default gen_random_uuid(),
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  org_id       uuid references public.organisations(id) on delete set null,
  name         text not null check (char_length(name) between 2 and 120),
  note         text check (note is null or char_length(note) <= 500),
  status       text not null default 'open' check (status in ('open', 'added', 'declined')),
  staff_note   text,
  resolved_by  uuid references auth.users(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists product_requests_status_idx on public.product_requests (status, created_at desc);
alter table public.product_requests enable row level security;

-- Staff see everything; a user sees only their own. All writes go through the functions below.
drop policy if exists product_requests_read on public.product_requests;
create policy product_requests_read on public.product_requests for select to authenticated
  using (public.is_oxl_admin() or requested_by = auth.uid());

create or replace function public.submit_product_request(p_name text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Enter the product name (2 to 120 characters).';
  end if;
  select id into v_id from public.product_requests
   where requested_by = auth.uid() and status = 'open' and lower(name) = lower(v_name) limit 1;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.product_requests where requested_by = auth.uid() and status = 'open') >= 5 then
    raise exception 'You already have 5 open requests. OXL staff will review them first.';
  end if;
  insert into public.product_requests (requested_by, org_id, name, note)
  values (auth.uid(), public.my_org_id(), v_name, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_product_requests()
returns table (id uuid, name text, note text, status text, staff_note text, created_at timestamptz, resolved_at timestamptz, org_name text, requester_email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can do this.'; end if;
  return query
    select r.id, r.name, r.note, r.status, r.staff_note, r.created_at, r.resolved_at, o.name, u.email::text
      from public.product_requests r
      left join public.organisations o on o.id = coalesce(r.org_id, (select p.org_id from public.profiles p where p.id = r.requested_by))
      left join auth.users u on u.id = r.requested_by
     order by (r.status = 'open') desc, r.created_at desc;
end $$;

create or replace function public.resolve_product_request(p_id uuid, p_status text, p_staff_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.product_requests; v_org uuid;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can do this.'; end if;
  if p_status not in ('added', 'declined') then raise exception 'Status must be added or declined.'; end if;
  select * into r from public.product_requests where id = p_id and status = 'open';
  if not found then raise exception 'That request is already closed or does not exist.'; end if;
  update public.product_requests
     set status = p_status, staff_note = nullif(btrim(coalesce(p_staff_note, '')), ''), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id;
  v_org := coalesce(r.org_id, (select org_id from public.profiles where id = r.requested_by));
  if v_org is not null then
    insert into public.notifications (org_id, title, body, link)
    values (v_org,
      case when p_status = 'added' then 'Product added: ' || r.name else 'About your product request: ' || r.name end,
      case when p_status = 'added' then 'It is now in the product list. Add it under Profile.'
           else coalesce(nullif(btrim(coalesce(p_staff_note, '')), ''), 'OXL could not add it. Pick the closest product and describe yours in your profile.') end,
      '/profile');
  end if;
end $$;

revoke all on function public.submit_product_request(text, text) from public;
revoke all on function public.list_product_requests() from public;
revoke all on function public.resolve_product_request(uuid, text, text) from public;
grant execute on function public.submit_product_request(text, text) to authenticated;
grant execute on function public.list_product_requests() to authenticated;
grant execute on function public.resolve_product_request(uuid, text, text) to authenticated;
