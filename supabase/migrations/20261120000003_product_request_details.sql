-- Product requests: three plain-language details that help staff pick the right code, category and unit.
alter table public.product_requests
  add column if not exists form text check (form is null or form in ('raw', 'processed', 'packaged')),
  add column if not exists sold_by text check (sold_by is null or sold_by in ('kg', 'tonne', 'bag', 'piece', 'litre')),
  add column if not exists other_names text check (other_names is null or char_length(other_names) <= 200);

-- The old two-argument version is replaced; calls that send only name and note keep working through the defaults.
drop function if exists public.submit_product_request(text, text);
create or replace function public.submit_product_request(
  p_name text, p_note text default null, p_form text default null, p_sold_by text default null, p_other_names text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Enter the product name (2 to 120 characters).';
  end if;
  if p_form is not null and p_form not in ('raw', 'processed', 'packaged') then raise exception 'Choose raw, processed or packaged.'; end if;
  if p_sold_by is not null and p_sold_by not in ('kg', 'tonne', 'bag', 'piece', 'litre') then raise exception 'Choose how you sell it.'; end if;
  select id into v_id from public.product_requests
   where requested_by = auth.uid() and status = 'open' and lower(name) = lower(v_name) limit 1;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.product_requests where requested_by = auth.uid() and status = 'open') >= 5 then
    raise exception 'You already have 5 open requests. OXL staff will review them first.';
  end if;
  insert into public.product_requests (requested_by, org_id, name, note, form, sold_by, other_names)
  values (auth.uid(), public.my_org_id(), v_name, nullif(btrim(coalesce(p_note, '')), ''), p_form, p_sold_by,
          nullif(left(btrim(coalesce(p_other_names, '')), 200), ''))
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.list_product_requests();
create or replace function public.list_product_requests()
returns table (id uuid, name text, note text, status text, staff_note text, created_at timestamptz, resolved_at timestamptz,
               org_name text, requester_email text, form text, sold_by text, other_names text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL staff can do this.'; end if;
  return query
    select r.id, r.name, r.note, r.status, r.staff_note, r.created_at, r.resolved_at, o.name, u.email::text, r.form, r.sold_by, r.other_names
      from public.product_requests r
      left join public.organisations o on o.id = coalesce(r.org_id, (select p.org_id from public.profiles p where p.id = r.requested_by))
      left join auth.users u on u.id = r.requested_by
     order by (r.status = 'open') desc, r.created_at desc;
end $$;

revoke all on function public.submit_product_request(text, text, text, text, text) from public;
revoke all on function public.list_product_requests() from public;
grant execute on function public.submit_product_request(text, text, text, text, text) to authenticated;
grant execute on function public.list_product_requests() to authenticated;
