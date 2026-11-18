-- When the buyer has not chosen a transport mode, assume the cheapest route (sea for bulk goods)
-- instead of the fastest (air), so timing checks are not over-optimistic.
create or replace function public.route_estimate(p_from uuid, p_to uuid, p_from_country char(2), p_to_country char(2), p_mode text)
returns table (route_id uuid, mode text, total_days int, cost_usd_per_tonne numeric, exact boolean, label text)
language sql stable set search_path = public as $$
  (select r.id, r.mode, r.total_days, r.cost_usd_per_tonne, true,
          a.name || ' → ' || b.name || ' by ' || r.mode
   from public.routes r join public.locations a on a.id = r.from_location_id join public.locations b on b.id = r.to_location_id
   where r.from_location_id = p_from and r.to_location_id = p_to and (coalesce(p_mode, 'any') = 'any' or r.mode = p_mode)
   order by r.cost_usd_per_tonne, r.total_days limit 1)
  union all
  (select r.id, r.mode, r.total_days, r.cost_usd_per_tonne, false,
          'similar route ' || a.name || ' → ' || b.name || ' by ' || r.mode
   from public.routes r join public.locations a on a.id = r.from_location_id join public.locations b on b.id = r.to_location_id
   where a.country = coalesce((select country from public.locations where id = p_from), p_from_country)
     and b.country = coalesce((select country from public.locations where id = p_to), p_to_country)
     and (coalesce(p_mode, 'any') = 'any' or r.mode = p_mode)
   order by r.cost_usd_per_tonne, r.total_days limit 1)
  limit 1
$$;
