-- OXL MVP — Week 2 (M2): sign-up roles, profiles, agent registration, agent clients with consent.

-- 1. An organisation's role can only be changed by OXL staff
--    (closes a gap where a member could switch its own role, e.g. exporter → financier)
create or replace function public.guard_verification_tier() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.verification_tier is distinct from old.verification_tier
     and coalesce(current_setting('oxl.allow_tier_change', true), 'off') <> 'on' then
    raise exception 'verification_tier can only be changed by an OXL admin';
  end if;
  if (new.is_suspended is distinct from old.is_suspended or new.suspended_reason is distinct from old.suspended_reason
      or new.role is distinct from old.role or new.is_demo is distinct from old.is_demo)
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_oxl_admin() then
    raise exception 'Only OXL admins can change an organisation''s role, demo flag or suspension';
  end if;
  return new;
end $$;

-- 2. Contact details for clients an agent onboards (often offline farmers).
--    Kept on the consent record, so only the agent, the client and OXL staff can see them.
alter table public.agent_clients
  add column client_contact_name   text,
  add column client_contact_phone  text;

-- 3. An agent onboards a new client business with recorded consent (user story A2)
create or replace function public.agent_create_client(
  p_name text, p_role public.org_role, p_country char(2), p_city text,
  p_registration_no text, p_description text, p_hs_codes text[],
  p_contact_name text, p_contact_phone text,
  p_consent_method text, p_consent_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_agent uuid := public.my_org_id(); v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if v_agent is null or public.org_role_of(v_agent) <> 'agent' then
    raise exception 'Only registered agents can onboard clients';
  end if;
  if exists (select 1 from public.organisations where id = v_agent and is_suspended) then
    raise exception 'Your agent account is suspended';
  end if;
  if p_role not in ('exporter', 'importer') then
    raise exception 'Agents can onboard exporters and importers only';
  end if;
  if p_consent_method not in ('signed_form', 'recorded_verbal') then
    raise exception 'Record how the client gave consent (signed form or recorded verbal consent)';
  end if;
  if coalesce(trim(p_contact_name), '') = '' then raise exception 'Client contact name is required'; end if;

  insert into public.organisations (name, role, country, city, registration_no, description, hs_codes, created_by)
  values (p_name, p_role, p_country, p_city, p_registration_no, p_description, coalesce(p_hs_codes, '{}'), auth.uid())
  returning id into v_org;

  insert into public.verifications (org_id, tier, method, notes, verified_by)
  values (v_org, 'self_declared', 'onboarded by agent',
          'Agent: ' || (select name from public.organisations where id = v_agent), auth.uid());

  insert into public.agent_clients (agent_org_id, client_org_id, consent_method, consent_note,
                                    client_contact_name, client_contact_phone, created_by)
  values (v_agent, v_org, p_consent_method, p_consent_note, p_contact_name, p_contact_phone, auth.uid());

  return v_org;
end $$;
grant execute on function public.agent_create_client(text, public.org_role, char, text, text, text, text[], text, text, text, text) to authenticated;

-- 4. An agent may keep its active clients' profiles up to date (never their tier, role or suspension)
create policy orgs_update_by_agent on public.organisations for update to authenticated
  using (public.is_active_agent_of(id))
  with check (public.is_active_agent_of(id));
