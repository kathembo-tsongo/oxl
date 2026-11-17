-- Shared grade suggestions per commodity. OXL staff maintain the catalogue.
create table public.commodity_grades (
  hs_code text not null references public.commodities(hs_code) on delete cascade,
  grade_name text not null check (btrim(grade_name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (hs_code, grade_name)
);

create index commodity_grades_order_idx
  on public.commodity_grades (hs_code, sort_order, grade_name);

alter table public.commodity_grades enable row level security;

grant select on public.commodity_grades to anon, authenticated;
grant insert, update, delete on public.commodity_grades to authenticated;

create policy commodity_grades_read
  on public.commodity_grades for select to anon, authenticated
  using (true);

create policy commodity_grades_admin_write
  on public.commodity_grades for all to authenticated
  using (public.is_oxl_admin())
  with check (public.is_oxl_admin());

insert into public.commodity_grades (hs_code, grade_name, sort_order)
select seed.hs_code, seed.grade_name, seed.sort_order
from (values
  ('1801', 'Grade 1', 10), ('1801', 'Grade 2', 20), ('1801', 'Fair average quality', 30),
  ('1803', 'Natural cocoa liquor', 10), ('1803', 'Alkalised cocoa liquor', 20),
  ('0801', 'RCN (raw)', 10), ('0801', 'W180', 20), ('0801', 'W240', 30), ('0801', 'W320', 40), ('0801', 'W450', 50), ('0801', 'Splits', 60),
  ('0901', 'AA', 10), ('0901', 'AB', 20), ('0901', 'PB', 30), ('0901', 'C', 40), ('0901', 'E', 50), ('0901', 'Robusta', 60),
  ('0902', 'BP1', 10), ('0902', 'PF1', 20), ('0902', 'PD', 30), ('0902', 'Dust', 40),
  ('0804', 'Hass, size 12–14', 10), ('0804', 'Hass, size 16–18', 20), ('0804', 'Hass, size 20–22', 30), ('0804', 'Hass, size 24', 40), ('0804', 'Fuerte', 50), ('0804', 'Kent mango', 60), ('0804', 'Apple mango', 70), ('0804', 'MD2 pineapple', 80),
  ('1515', 'Grade A (unrefined)', 10), ('1515', 'Grade B', 20), ('1515', 'Refined', 30),
  ('1207', 'Whitish 99/1/1', 10), ('1207', 'Mixed', 20), ('1207', 'Natural', 30),
  ('1005', 'White maize, Grade 1', 10), ('1005', 'White maize, Grade 2', 20), ('1005', 'Yellow maize, Grade 1', 30), ('1005', 'Yellow maize, Grade 2', 40),
  ('0713', 'Grade 1', 10), ('0713', 'Grade 2', 20), ('0713', 'Green grams', 30), ('0713', 'Cowpeas', 40), ('0713', 'Red kidney beans', 50),
  ('0603', 'Roses, 40 cm', 10), ('0603', 'Roses, 50 cm', 20), ('0603', 'Roses, 60 cm', 30), ('0603', 'Export grade A', 40), ('0603', 'Export grade B', 50), ('0603', 'Summer flowers', 60),
  ('0910', 'Dried ginger, split', 10), ('0910', 'Fresh ginger', 20), ('0910', 'Turmeric fingers', 30)
) as seed(hs_code, grade_name, sort_order)
join public.commodities c on c.hs_code = seed.hs_code
on conflict (hs_code, grade_name) do nothing;