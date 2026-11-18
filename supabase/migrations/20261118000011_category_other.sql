-- "Other" activity, so no business is stuck when its activity is not in the list.
insert into public.business_categories (country, scheme, code, name, parent_code, is_active)
select null, 'OXL', 'OTHER', 'Other (describe below)', null, true
where not exists (select 1 from public.business_categories where scheme = 'OXL' and code = 'OTHER');
