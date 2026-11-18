-- Remove the fictional seeded businesses (is_demo = true) so the platform shows only real registrations.
-- Related rows (offers, requests, deals, documents, ratings, notifications, ...) cascade.
-- Logins attached to them are kept; their profiles simply lose the organisation.
do $$
declare n int;
begin
  select count(*) into n from public.organisations where is_demo;
  if n > 16 then
    raise exception 'Expected at most 16 seeded organisations, found %. Aborting.', n;
  end if;

  -- agent_networks.requested_by has no delete rule, so clear those rows first.
  delete from public.agent_networks
  where requested_by in (select id from public.organisations where is_demo);

  delete from public.organisations where is_demo;
end $$;
