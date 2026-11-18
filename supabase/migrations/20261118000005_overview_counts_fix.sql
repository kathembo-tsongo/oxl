-- Correct the overview counts using the real status values, and add open safety signals.
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then raise exception 'OXL staff only'; end if;
  return jsonb_build_object(
    'organisations_total', (select count(*) from public.organisations),
    'organisations_by_role', (select coalesce(jsonb_object_agg(role::text, n), '{}'::jsonb)
        from (select role, count(*) n from public.organisations group by role) s),
    'organisations_by_tier', (select coalesce(jsonb_object_agg(verification_tier::text, n), '{}'::jsonb)
        from (select verification_tier, count(*) n from public.organisations group by verification_tier) s),
    'suspended', (select count(*) from public.organisations where is_suspended),
    'safety_alerts', (select count(*) from public.organisations where safety_alert is not null),
    'open_safety_signals', (select count(*) from public.risk_flags where status::text = 'open'),
    'documents_awaiting_review', (select count(*) from public.documents where review_status::text = 'pending'),
    'locations_not_reviewed', (select count(*) from public.org_locations where reviewed_at is null),
    'open_problem_reports', (select count(*) from public.problem_reports where status::text in ('new', 'investigating')),
    'deals_by_status', (select coalesce(jsonb_object_agg(status::text, n), '{}'::jsonb)
        from (select status, count(*) n from public.interests group by status) s),
    'new_organisations_7d', (select count(*) from public.organisations where created_at > now() - interval '7 days'),
    'new_deals_7d', (select count(*) from public.interests where created_at > now() - interval '7 days')
  );
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
