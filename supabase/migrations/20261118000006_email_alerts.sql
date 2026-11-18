-- Email alerts: every in-app notification is also emailed once to the logins of that organisation.
alter table public.notifications add column if not exists email_sent_at timestamptz;
alter table public.profiles add column if not exists email_alerts boolean not null default true;

-- Do not email anything that already exists
update public.notifications set email_sent_at = now() where email_sent_at is null;
create index if not exists notifications_unsent_idx on public.notifications (created_at) where email_sent_at is null;

create or replace function public.pending_email_alerts(p_limit int default 200)
returns table (notification_id uuid, to_email text, title text, body text, link text)
language sql security definer set search_path = public, auth as $$
  select n.id, u.email::text, n.title, n.body, n.link
  from public.notifications n
  join public.profiles p on p.org_id = n.org_id
  join auth.users u on u.id = p.id
  where n.email_sent_at is null
    and n.created_at > now() - interval '2 days'
    and p.email_alerts
    and u.email is not null
  order by n.created_at
  limit greatest(p_limit, 1)
$$;

create or replace function public.mark_alerts_sent(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.notifications set email_sent_at = now() where id = any (p_ids)
$$;

-- Only the Edge Function (service role) may use these
revoke all on function public.pending_email_alerts(int) from public, anon, authenticated;
revoke all on function public.mark_alerts_sent(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_email_alerts(int) to service_role;
grant execute on function public.mark_alerts_sent(uuid[]) to service_role;
