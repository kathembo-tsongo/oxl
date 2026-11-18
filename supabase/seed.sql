-- OXL reference data: countries and commodities.
-- Safe to run more than once. Run after the migrations
-- (Supabase SQL editor, or: psql "$DB_URL" -f supabase/seed.sql).
-- No businesses, listings or deals are seeded: every organisation on the platform registers itself.

-- Countries: launch markets plus common counterparties
insert into public.countries (code, name, is_african, is_pilot) values
  ('KE','Kenya',true,true), ('GH','Ghana',true,true),
  ('NG','Nigeria',true,false), ('CI','Côte d''Ivoire',true,false), ('TZ','Tanzania',true,false),
  ('UG','Uganda',true,false), ('RW','Rwanda',true,false), ('ZA','South Africa',true,false),
  ('EG','Egypt',true,false), ('GB','United Kingdom',false,false), ('NL','Netherlands',false,false),
  ('AE','United Arab Emirates',false,false), ('CN','China',false,false), ('IN','India',false,false)
on conflict (code) do nothing;

-- Commodities relevant to KE and GH agribusiness (HS 2022 headings)
insert into public.commodities (hs_code, name) values
  ('1801','Cocoa beans'), ('1803','Cocoa paste'), ('0801','Cashew nuts'), ('0901','Coffee'),
  ('0902','Tea'), ('0804','Avocados, mangoes, pineapples'), ('1515','Shea butter and other vegetable fats'),
  ('1207','Sesame and other oil seeds'), ('1005','Maize'), ('0713','Dried legumes (beans, pulses)'),
  ('0603','Cut flowers'), ('0910','Ginger, turmeric and spices')
on conflict (hs_code) do nothing;
