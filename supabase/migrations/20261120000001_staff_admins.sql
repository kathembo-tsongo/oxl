-- OXL MVP: OXL staff can add and remove other OXL staff (admins) from the Staff screen.
-- Everything goes through SECURITY DEFINER functions. Only an admin who has passed two-step sign-in
-- (is_oxl_admin() already checks this) can call them. Users still cannot make themselves admin:
-- the guard_profile trigger is unchanged.

-- Record of every change: who made whom an admin (or removed them), and when
create table if not exists public.staff_admin_log (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null,
  target_email text not null,
  made_admin  boolean not null,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_by_email text,
  created_at  timestamptz not null default now()
);
alter table public.staff_admin_log enable row level security;
drop policy if exists staff_admin_log_read on public.staff_admin_log;
create policy staff_admin_log_read on public.staff_admin_log for select to authenticated using (public.is_oxl_admin());
-- no insert/update/delete policies: rows are written only by set_staff_admin()

-- List OXL staff: email, name, whether a second factor is enrolled, last sign-in
create or replace function public.list_staff_admins()
returns table (user_id uuid, email text, full_name text, mfa_enrolled boolean, last_sign_in_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL admins can see the staff list'; end if;
  return query
    select p.id, u.email::text, p.full_name,
           exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
           u.last_sign_in_at,
           p.id = auth.uid()
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.is_oxl_admin
     order by u.email;
end $$;

-- Make a person an OXL admin, or take it away. The person must already have an account with a confirmed email.
create or replace function public.set_staff_admin(p_email text, p_make_admin boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_user  auth.users%rowtype;
  v_me_email text;
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL admins can change staff access'; end if;
  if v_email is null or v_email = '' then raise exception 'Enter an email address'; end if;

  select * into v_user from auth.users where lower(email) = v_email;
  if not found then
    raise exception 'No account with that email. Ask them to sign up on OXL and confirm their email first.';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'That account has not confirmed its email yet.';
  end if;

  if not p_make_admin then
    if v_user.id = auth.uid() then raise exception 'You cannot remove your own admin access. Ask another admin to do it.'; end if;
    if (select count(*) from public.profiles where is_oxl_admin) <= 1 then
      raise exception 'There must always be at least one OXL admin.';
    end if;
  end if;

  -- The profile row may not exist yet (it is normally created at onboarding)
  insert into public.profiles (id, is_oxl_admin) values (v_user.id, p_make_admin)
  on conflict (id) do update set is_oxl_admin = excluded.is_oxl_admin;

  select email into v_me_email from auth.users where id = auth.uid();
  insert into public.staff_admin_log (target_id, target_email, made_admin, changed_by, changed_by_email)
  values (v_user.id, v_user.email, p_make_admin, auth.uid(), v_me_email);
end $$;

-- Recent changes, newest first
create or replace function public.staff_admin_history(p_limit int default 20)
returns table (target_email text, made_admin boolean, changed_by_email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then raise exception 'Only OXL admins can see this'; end if;
  return query select l.target_email, l.made_admin, l.changed_by_email, l.created_at
                 from public.staff_admin_log l order by l.created_at desc limit least(greatest(p_limit, 1), 100);
end $$;

revoke all on function public.list_staff_admins() from public, anon;
revoke all on function public.set_staff_admin(text, boolean) from public, anon;
revoke all on function public.staff_admin_history(int) from public, anon;
grant execute on function public.list_staff_admins() to authenticated;
grant execute on function public.set_staff_admin(text, boolean) to authenticated;
grant execute on function public.staff_admin_history(int) to authenticated;

-- Record the two admins added by hand before this screen existed (safe to run again)
insert into public.staff_admin_log (target_id, target_email, made_admin, changed_by_email)
select p.id, u.email, true, 'added directly in the database'
  from public.profiles p join auth.users u on u.id = p.id
 where p.is_oxl_admin
   and not exists (select 1 from public.staff_admin_log l where l.target_id = p.id);
