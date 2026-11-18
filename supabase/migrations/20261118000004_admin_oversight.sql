-- Admin oversight: an append-only audit trail of staff actions, plus read functions for the
-- admin overview, deal oversight and audit screens. Staff only (is_oxl_admin, which needs the two-step sign-in).

-- 1. Audit trail ---------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  org_id uuid,          -- no foreign key: history must survive deletion of an organisation
  detail jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_org_idx on public.audit_log (org_id);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_staff_read on public.audit_log;
create policy audit_log_staff_read on public.audit_log for select using (public.is_oxl_admin());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;   -- RLS limits this to staff

-- Nobody can edit or remove history.
create or replace function public.trg_audit_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'The audit log cannot be changed';
end $$;
drop trigger if exists trg_audit_immutable on public.audit_log;
create trigger trg_audit_immutable before update or delete on public.audit_log
  for each row execute function public.trg_audit_immutable();

create or replace function public.audit_write(p_action text, p_org uuid, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, action, org_id, detail)
  values (auth.uid(), p_action, p_org, coalesce(p_detail, '{}'::jsonb));
end $$;
revoke execute on function public.audit_write(text, uuid, jsonb) from public, anon, authenticated;

-- 2. Triggers: record staff actions only (an owner editing their own profile is not logged) ---
create or replace function public.trg_audit_organisations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_oxl_admin() then return new; end if;
  if new.verification_tier is distinct from old.verification_tier then
    perform public.audit_write('tier_changed', new.id,
      jsonb_build_object('from', old.verification_tier::text, 'to', new.verification_tier::text));
  end if;
  if new.is_suspended is distinct from old.is_suspended then
    perform public.audit_write(case when new.is_suspended then 'suspended' else 'reinstated' end, new.id,
      jsonb_build_object('reason', new.suspended_reason));
  end if;
  if new.geo_status is distinct from old.geo_status then
    perform public.audit_write('location_status_changed', new.id,
      jsonb_build_object('from', old.geo_status::text, 'to', new.geo_status::text));
  end if;
  if new.safety_alert is distinct from old.safety_alert then
    perform public.audit_write('safety_alert_changed', new.id,
      jsonb_build_object('from', old.safety_alert::text, 'to', new.safety_alert::text, 'note', new.safety_alert_note));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_organisations on public.organisations;
create trigger trg_audit_organisations after update on public.organisations
  for each row execute function public.trg_audit_organisations();

create or replace function public.trg_audit_documents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_oxl_admin() and new.review_status is distinct from old.review_status then
    perform public.audit_write('document_reviewed', new.org_id,
      jsonb_build_object('doc_type', new.doc_type::text, 'from', old.review_status::text,
                         'to', new.review_status::text, 'notes', new.review_notes));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_documents on public.documents;
create trigger trg_audit_documents after update on public.documents
  for each row execute function public.trg_audit_documents();

create or replace function public.trg_audit_org_locations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_oxl_admin() and new.reviewed_at is distinct from old.reviewed_at then
    perform public.audit_write('location_reviewed', new.org_id, jsonb_build_object('note', new.review_note));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_org_locations on public.org_locations;
create trigger trg_audit_org_locations after update on public.org_locations
  for each row execute function public.trg_audit_org_locations();

create or replace function public.trg_audit_interests() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_oxl_admin() and new.status::text = 'cancelled' and old.status::text <> 'cancelled'
     and new.cancelled_by_org_id is null then
    perform public.audit_write('deal_cancelled_by_staff', null,
      jsonb_build_object('deal_id', new.id, 'reason', new.cancel_reason, 'from_status', old.status::text));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_interests on public.interests;
create trigger trg_audit_interests after update on public.interests
  for each row execute function public.trg_audit_interests();

create or replace function public.trg_audit_problem_reports() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_oxl_admin() and new.status is distinct from old.status then
    perform public.audit_write('report_status_changed', new.reported_org_id,
      jsonb_build_object('report_id', new.id, 'from', old.status::text, 'to', new.status::text, 'note', new.admin_note));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_problem_reports on public.problem_reports;
create trigger trg_audit_problem_reports after update on public.problem_reports
  for each row execute function public.trg_audit_problem_reports();

create or replace function public.trg_audit_field_visits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_oxl_admin() then
    perform public.audit_write('field_visit_recorded', new.org_id,
      jsonb_build_object('visit_date', new.visit_date, 'outcome', new.outcome::text));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_field_visits on public.field_visits;
create trigger trg_audit_field_visits after insert on public.field_visits
  for each row execute function public.trg_audit_field_visits();

-- 3. Admin overview ---------------------------------------------------------------
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
    'safety_alerts', (select count(*) from public.organisations where safety_alert is not null and safety_alert::text not in ('', 'none', 'false')),
    'documents_awaiting_review', (select count(*) from public.documents where review_status::text not in ('approved', 'rejected')),
    'locations_not_reviewed', (select count(*) from public.org_locations where reviewed_at is null),
    'open_problem_reports', (select count(*) from public.problem_reports where resolved_at is null),
    'deals_by_status', (select coalesce(jsonb_object_agg(status::text, n), '{}'::jsonb)
        from (select status, count(*) n from public.interests group by status) s),
    'new_organisations_7d', (select count(*) from public.organisations where created_at > now() - interval '7 days'),
    'new_deals_7d', (select count(*) from public.interests where created_at > now() - interval '7 days')
  );
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- 4. Deal oversight ---------------------------------------------------------------
create or replace function public.admin_deals(p_status text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_oxl_admin() then raise exception 'OXL staff only'; end if;
  select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.created_at desc), '[]'::jsonb) into result
  from (
    select i.id, i.created_at, i.updated_at, c.name as commodity,
           so.id as seller_id, so.name as seller, bo.id as buyer_id, bo.name as buyer,
           i.status::text as status, i.proposed_by_side, i.match_score,
           i.agreed_quantity_tonnes, i.agreed_price_usd_per_tonne, i.seller_terms,
           i.shipped_at, i.seller_confirmed_delivery_at, i.buyer_confirmed_delivery_at,
           coalesce(co.name, case when i.cancelled_at is not null then 'OXL staff' end) as cancelled_by,
           i.cancel_reason, i.cancelled_at, i.cancelled_from_status::text as cancelled_from_status,
           ag.name as agent
    from public.interests i
    join public.offers o on o.id = i.offer_id
    join public.commodities c on c.hs_code = o.hs_code
    join public.requests r on r.id = i.request_id
    join public.organisations so on so.id = o.org_id
    join public.organisations bo on bo.id = r.org_id
    left join public.organisations co on co.id = i.cancelled_by_org_id
    left join public.organisations ag on ag.id = i.agent_org_id
    where p_status is null or i.status::text = p_status
    order by i.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  ) d;
  return result;
end $$;
revoke execute on function public.admin_deals(text, int, int) from public, anon;
grant execute on function public.admin_deals(text, int, int) to authenticated;

-- 5. Audit reader -----------------------------------------------------------------
create or replace function public.admin_audit(p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_oxl_admin() then raise exception 'OXL staff only'; end if;
  select coalesce(jsonb_agg(row_to_json(a)::jsonb order by a.at desc), '[]'::jsonb) into result
  from (
    select l.id, l.at, l.action, l.org_id, o.name as organisation,
           l.actor, p.full_name as actor_name, l.detail
    from public.audit_log l
    left join public.organisations o on o.id = l.org_id
    left join public.profiles p on p.id = l.actor
    order by l.at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  ) a;
  return result;
end $$;
revoke execute on function public.admin_audit(int, int) from public, anon;
grant execute on function public.admin_audit(int, int) to authenticated;
