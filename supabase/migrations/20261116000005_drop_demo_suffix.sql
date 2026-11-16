-- Drop the "(demo)" suffix from names and notes shown in the interface.
-- The organisations are still flagged is_demo = true, so they can be found and removed later.

update public.organisations
set name = regexp_replace(name, '\s*\(demo\)\s*$', '')
where is_demo and name ~ '\(demo\)\s*$';

update public.offers
set notes = regexp_replace(notes, '\s*\(demo\)', '', 'g')
where notes like '%(demo)%';

update public.requests
set notes = regexp_replace(notes, '\s*\(demo\)', '', 'g')
where notes like '%(demo)%';

-- Verification history shows the method on every trust report: replace "demo seed" with a neutral label.
update public.verifications
set method = 'initial listing', notes = null
where method = 'demo seed';

-- Keep seeded rows from sending a "verification level changed" notification.
create or replace function public.trg_notify_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.method not in ('self registration', 'onboarded by agent', 'demo seed', 'initial listing') then
    perform public.notify(new.org_id, 'Your verification level is now ' || replace(new.tier::text, '_', ' '), new.method, '/profile');
  end if;
  return new;
end $$;
