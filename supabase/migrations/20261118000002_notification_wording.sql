-- Buyer-first wording: the seller is told a buyer made an offer on their listing.
-- Status-change and cancellation notices are unchanged.
create or replace function public.trg_notify_deal() returns trigger
language plpgsql security definer set search_path = public as $$
declare seller uuid; buyer uuid; commodity text; s_name text; b_name text; label text; reason text;
begin
  select o.org_id, c.name into seller, commodity from public.offers o join public.commodities c on c.hs_code = o.hs_code where o.id = new.offer_id;
  select org_id into buyer from public.requests where id = new.request_id;
  select name into s_name from public.organisations where id = seller;
  select name into b_name from public.organisations where id = buyer;
  if tg_op = 'INSERT' then
    if new.initiated_by <> seller then perform public.notify(seller, b_name || ' made an offer on your ' || commodity, 'Review the offer: accept it, accept with your own terms, or decline.', '/'); end if;
    if new.initiated_by <> buyer  then perform public.notify(buyer,  s_name || ' can supply ' || commodity, s_name || ' responded to your request. Please review and reply.', '/'); end if;
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
