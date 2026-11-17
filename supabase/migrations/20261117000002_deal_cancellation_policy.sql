-- Record cancellation actor and reason; cancelled_from_status distinguishes withdrawals
-- from deals cancelled after acceptance for trust-report counts.
alter table public.interests
  add column cancelled_by_org_id uuid references public.organisations(id) on delete set null,
  add column cancel_reason text,
  add column cancelled_at timestamptz,
  add column cancelled_from_status text check (cancelled_from_status in ('proposed', 'accepted'));

-- Keep the existing deal lifecycle and party/agent checks, and apply the cancellation policy.
drop function if exists public.advance_deal(uuid, text, text);
create function public.advance_deal(
  p_deal_id uuid,
  p_action text,
  p_terms text default null,
  p_reason text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  d public.interests; o public.offers; r public.requests;
  me uuid := public.my_org_id();
  is_seller boolean; is_buyer boolean; is_admin boolean := public.is_oxl_admin();
  reason_clean text;
begin
  select * into d from public.interests where id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;
  select * into o from public.offers where id = d.offer_id;
  select * into r from public.requests where id = d.request_id;
  is_seller := coalesce(me = o.org_id, false) or coalesce(public.is_active_agent_of(o.org_id), false);
  is_buyer  := coalesce(me = r.org_id, false) or coalesce(public.is_active_agent_of(r.org_id), false);
  if not (is_seller or is_buyer or is_admin) then raise exception 'Only the buyer or the seller can update this deal'; end if;

  if p_action in ('accept', 'decline') then
    if d.status <> 'proposed' then raise exception 'This deal is no longer waiting for a reply'; end if;
    if d.proposed_by_side = 'buyer' then
      if not (is_seller or is_admin) then raise exception 'Only the seller can reply to a purchase offer'; end if;
    elsif d.proposed_by_side = 'seller' then
      if not (is_buyer or is_admin) then raise exception 'Only the buyer can reply to the seller''s proposal'; end if;
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
    if d.status not in ('proposed', 'accepted') then
      raise exception 'This deal can no longer be cancelled';
    end if;

    reason_clean := nullif(btrim(p_reason), '');
    if reason_clean is not null and length(reason_clean) > 500 then
      raise exception 'Cancellation reason must be at most 500 characters';
    end if;

    if d.status = 'accepted' or is_admin then
      if reason_clean is null or length(reason_clean) < 5 then
        raise exception 'A cancellation reason of at least 5 characters is required';
      end if;
    elsif d.proposed_by_side is not null and not is_buyer then
      raise exception 'Only the buyer can withdraw a proposed deal; the seller can decline it';
    end if;
    -- A null proposed_by_side is a legacy deal: preserve the prior either-party cancellation rule.
    update public.interests set
      status = 'cancelled',
      cancelled_by_org_id = case when is_buyer then r.org_id when is_seller then o.org_id else null end,
      cancel_reason = reason_clean,
      cancelled_at = now(),
      cancelled_from_status = d.status::text,
      updated_at = now()
    where id = d.id;
  else
    raise exception 'Unknown action %', p_action;
  end if;
  return (select status::text from public.interests where id = d.id);
end $$;
revoke execute on function public.advance_deal(uuid, text, text, text) from public, anon;
grant execute on function public.advance_deal(uuid, text, text, text) to authenticated;

-- Status-change notifications keep their existing text except cancellation, which tells
-- the counterparty (and, for OXL-admin cancellations, both parties) who cancelled and why.
create or replace function public.trg_notify_deal() returns trigger
language plpgsql security definer set search_path = public as $$
declare seller uuid; buyer uuid; commodity text; s_name text; b_name text; label text; reason text;
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
    if new.status = 'cancelled' then
      select name into label from public.organisations where id = new.cancelled_by_org_id;
      label := coalesce(label, 'OXL staff');
      reason := nullif(btrim(new.cancel_reason), '');
      if new.cancelled_by_org_id = buyer then
        perform public.notify(seller, commodity || ' deal cancelled by ' || label,
          'Cancelled by ' || label || coalesce('. Reason: ' || reason, '.'), '/');
      elsif new.cancelled_by_org_id = seller then
        perform public.notify(buyer, commodity || ' deal cancelled by ' || label,
          'Cancelled by ' || label || coalesce('. Reason: ' || reason, '.'), '/');
      else
        perform public.notify(seller, commodity || ' deal cancelled by ' || label,
          'Cancelled by ' || label || coalesce('. Reason: ' || reason, '.'), '/');
        perform public.notify(buyer, commodity || ' deal cancelled by ' || label,
          'Cancelled by ' || label || coalesce('. Reason: ' || reason, '.'), '/');
      end if;
    else
      perform public.notify(seller, commodity || ' deal with ' || b_name || ': ' || label, null, '/');
      perform public.notify(buyer,  commodity || ' deal with ' || s_name || ': ' || label, null, '/');
      perform public.notify(new.agent_org_id, commodity || ' deal ' || s_name || ' → ' || b_name || ': ' || label, null, '/');
    end if;
  end if;
  return new;
end $$;

-- Recreate the trust report without changing its score: show aggregate counts only,
-- never cancellation reasons. Previously cancelled rows cannot be classified retroactively.
create or replace function public.risk_report(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  org public.organisations;
  f jsonb := '[]'::jsonb;
  pts int; total int := 0;
  n_docs int; n_trades int; n_accepted int; n_cancelled_after_acceptance int;
  years int; n_profile int; n_rated int; n_ontime int; n_quality int;
  band text;
begin
  if not public.can_view_report(p_org_id) then
    raise exception 'This report has not been shared with your organisation';
  end if;
  select * into org from public.organisations where id = p_org_id;
  if not found then raise exception 'Organisation not found'; end if;

  pts := round(35 * public.tier_rank(org.verification_tier) / 3.0);
  f := f || jsonb_build_object('factor','Verification level','points',pts,'max',35,
        'detail', initcap(replace(org.verification_tier::text, '_', ' ')));
  total := total + pts;

  select count(distinct doc_type) into n_docs from public.documents
  where org_id = p_org_id and review_status = 'approved'
    and doc_type in ('business_registration','export_licence','tax_certificate','quality_certificate');
  pts := 5 * n_docs;
  f := f || jsonb_build_object('factor','Key documents approved','points',pts,'max',20,
        'detail', n_docs || ' of 4 (registration, export licence, tax, quality)');
  total := total + pts;

  years := case when org.year_established is null then 0
                else greatest(extract(year from now())::int - org.year_established, 0) end;
  pts := round(15 * least(years, 10) / 10.0);
  f := f || jsonb_build_object('factor','Years trading','points',pts,'max',15,
        'detail', case when org.year_established is null then 'Not stated' else years || ' years (since ' || org.year_established || ')' end);
  total := total + pts;

  select count(*) into n_trades from public.interests i
  where i.status = 'completed' and (
    exists (select 1 from public.offers o where o.id = i.offer_id and o.org_id = p_org_id)
    or exists (select 1 from public.requests r where r.id = i.request_id and r.org_id = p_org_id));
  select count(*) filter (where i.status in ('accepted', 'in_transit', 'delivered', 'completed')
                            or (i.status = 'cancelled' and i.cancelled_from_status = 'accepted')),
         count(*) filter (where i.status = 'cancelled' and i.cancelled_from_status = 'accepted' and i.cancelled_by_org_id = p_org_id)
    into n_accepted, n_cancelled_after_acceptance
  from public.interests i
  where exists (select 1 from public.offers o where o.id = i.offer_id and o.org_id = p_org_id)
     or exists (select 1 from public.requests r where r.id = i.request_id and r.org_id = p_org_id);

  select count(*), count(*) filter (where on_time), count(*) filter (where quality_as_described)
    into n_rated, n_ontime, n_quality from public.ratings where rated_org_id = p_org_id;
  pts := 2 * least(n_trades, 5) + case when n_rated = 0 then 0 else round(5.0 * n_ontime / n_rated)::int end;
  f := f || jsonb_build_object('factor','Delivery record on OXL','points',pts,'max',15, 'detail',
        n_trades || ' completed deal' || case when n_trades = 1 then '' else 's' end
        || '; ' || n_cancelled_after_acceptance || ' cancelled after acceptance of ' || n_accepted || ' accepted deals'
        || case when n_rated = 0 then '; no ratings yet'
                else '; ' || n_ontime || ' of ' || n_rated || ' rated on time, ' || n_quality || ' of ' || n_rated || ' as described' end);
  total := total + pts;

  n_profile := (org.registration_no is not null)::int + (org.city is not null)::int
             + (coalesce(length(org.description), 0) > 30)::int + (cardinality(org.hs_codes) > 0)::int
             + (org.year_established is not null)::int;
  pts := 3 * n_profile;
  f := f || jsonb_build_object('factor','Profile completeness','points',pts,'max',15, 'detail', n_profile || ' of 5 fields');
  total := total + pts;

  band := case when total >= 75 then 'A' when total >= 55 then 'B' when total >= 35 then 'C' else 'D' end;

  return jsonb_build_object(
    'org_id', org.id, 'org_name', org.name, 'country', org.country, 'role', org.role,
    'is_demo', org.is_demo, 'score', total, 'band', band, 'factors', f,
    'generated_at', now(),
    'disclaimer', 'Due-diligence information from OXL records. Not a credit rating or lending decision.'
  );
end $$;
