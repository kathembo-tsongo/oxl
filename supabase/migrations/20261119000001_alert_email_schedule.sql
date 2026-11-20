-- OXL MVP: send alert emails automatically every 5 minutes.
-- The Edge Function `send-alert-emails` already exists; this migration only calls it on a schedule.
-- No secret is stored here. The project address and the shared secret are read from Supabase Vault
-- (names: project_url, alert_cron_secret), which you set once from the SQL editor.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.run_alert_emails() returns bigint
language plpgsql security definer set search_path = public, extensions, vault as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'alert_cron_secret';
  if u is null or s is null then return null; end if;  -- not set up yet: do nothing
  return net.http_post(
    url := rtrim(u, '/') || '/functions/v1/send-alert-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
    body := '{}'::jsonb);
end $$;

revoke all on function public.run_alert_emails() from public, anon, authenticated;

do $$ begin perform cron.unschedule('oxl-alert-emails'); exception when others then null; end $$;
select cron.schedule('oxl-alert-emails', '*/5 * * * *', 'select public.run_alert_emails()');
