-- OXL MVP — Week 3 (M3): starter reference data for timing-aware matching.
-- All routes and certificate rules below are INDICATIVE starting values so the MVP can run.
-- OXL staff will replace them with freight-forwarder quotes and official guidance on the
-- "Reference data" admin page before the pilot.

-- Countries and commodities these rows depend on (already present on the live project;
-- repeated here so a fresh `supabase db reset`, which runs migrations before seed.sql, also works)
insert into public.countries (code, name, is_african, is_pilot) values
  ('KE','Kenya',true,true), ('GH','Ghana',true,true), ('NG','Nigeria',true,false), ('UG','Uganda',true,false)
on conflict (code) do nothing;
insert into public.commodities (hs_code, name) values
  ('1801','Cocoa beans'), ('1803','Cocoa paste'), ('0801','Cashew nuts'), ('0901','Coffee'),
  ('0902','Tea'), ('0804','Avocados, mangoes, pineapples'), ('1515','Shea butter and other vegetable fats'),
  ('1207','Sesame and other oil seeds'), ('1005','Maize'), ('0713','Dried legumes (beans, pulses)'),
  ('0603','Cut flowers'), ('0910','Ginger, turmeric and spices')
on conflict (hs_code) do nothing;

-- ── Locations: main towns, ports, border posts and airports for the Kenya–Ghana pilot ──
insert into public.locations (name, country, kind, lat, lon) values
  -- Kenya
  ('Mombasa',          'KE', 'port',    -4.043500,  39.668200),
  ('Nairobi',          'KE', 'town',    -1.292100,  36.821900),
  ('Nairobi (JKIA)',   'KE', 'airport', -1.319200,  36.927800),
  ('Murang''a',        'KE', 'town',    -0.721000,  37.152600),
  ('Nyeri',            'KE', 'town',    -0.420100,  36.947600),
  ('Kericho',          'KE', 'town',    -0.367700,  35.283100),
  ('Eldoret',          'KE', 'town',     0.514300,  35.269800),
  ('Malaba',           'KE', 'border',   0.634600,  34.281700),
  ('Busia',            'KE', 'border',   0.460800,  34.092100),
  -- Ghana
  ('Tema',             'GH', 'port',     5.639800,   0.010900),
  ('Takoradi',         'GH', 'port',     4.884500,  -1.755400),
  ('Accra',            'GH', 'town',     5.603700,  -0.187000),
  ('Accra (Kotoka)',   'GH', 'airport',  5.605200,  -0.166800),
  ('Kumasi',           'GH', 'town',     6.688500,  -1.624400),
  ('Sunyani',          'GH', 'town',     7.339900,  -2.326800),
  ('Techiman',         'GH', 'town',     7.586200,  -1.939500),
  ('Tamale',           'GH', 'town',     9.400800,  -0.839300),
  ('Aflao',            'GH', 'border',   6.116700,   1.183300),
  -- Neighbouring markets
  ('Lagos (Apapa)',    'NG', 'port',     6.447400,   3.364000),
  ('Lagos',            'NG', 'town',     6.524400,   3.379200),
  ('Kampala',          'UG', 'town',     0.347600,  32.582500)
on conflict (name, country, kind) do nothing;

-- ── Indicative routes (days and USD per tonne) ──
with r(f, fk, t, tk, mode, inland, port, transit, customs, cost) as (values
  ('Tema','port',      'Mombasa','port',       'sea',  0, 4, 35, 5,  150),
  ('Mombasa','port',   'Tema','port',          'sea',  0, 4, 35, 5,  150),
  ('Accra','town',     'Nairobi','town',       'sea',  1, 4, 35, 7,  180),
  ('Kumasi','town',    'Nairobi','town',       'sea',  2, 4, 35, 7,  190),
  ('Sunyani','town',   'Nairobi','town',       'sea',  2, 4, 35, 7,  195),
  ('Techiman','town',  'Nairobi','town',       'sea',  2, 4, 35, 7,  195),
  ('Tamale','town',    'Nairobi','town',       'sea',  3, 4, 35, 7,  205),
  ('Nairobi','town',   'Accra','town',         'sea',  2, 4, 35, 6,  180),
  ('Murang''a','town', 'Accra','town',         'sea',  2, 4, 35, 6,  185),
  ('Kericho','town',   'Accra','town',         'sea',  2, 4, 35, 6,  185),
  ('Nyeri','town',     'Accra','town',         'sea',  2, 4, 35, 6,  185),
  ('Accra','town',     'Nairobi','town',       'air',  1, 1,  2, 2, 2500),
  ('Nairobi','town',   'Accra','town',         'air',  1, 1,  2, 2, 2500),
  ('Accra','town',     'Lagos','town',         'road', 0, 2,  3, 2,   80),
  ('Kumasi','town',    'Lagos','town',         'road', 0, 2,  4, 2,   90),
  ('Nairobi','town',   'Kampala','town',       'road', 0, 1,  2, 1,   70)
)
insert into public.routes (from_location_id, to_location_id, mode, inland_days, port_days, transit_days, customs_days, cost_usd_per_tonne, source)
select a.id, b.id, r.mode, r.inland, r.port, r.transit, r.customs, r.cost,
       'Indicative estimate (Nov 2026); replace with freight-forwarder quotes'
from r
join public.locations a on a.name = r.f and a.kind = r.fk
join public.locations b on b.name = r.t and b.kind = r.tk
on conflict (from_location_id, to_location_id, mode) do nothing;

-- ── Indicative certificate rules ──
-- Unprocessed plant products need a phytosanitary certificate in the pilot markets.
insert into public.destination_requirements (destination_country, hs_code, certificate, is_mandatory, notes)
select d.code, c.hs_code, 'phytosanitary', true,
       'Indicative: confirm with KEPHIS (KE), PPRSD (GH) or NAQS (NG) before the pilot'
from (values ('KE'), ('GH'), ('NG')) d(code)
cross join (values ('1801'), ('0801'), ('0901'), ('0902'), ('0804'), ('1207'), ('1005'), ('0713'), ('0603'), ('0910')) c(hs_code)
where exists (select 1 from public.commodities x where x.hs_code = c.hs_code)
on conflict (destination_country, hs_code, certificate) do nothing;

-- A certificate of origin is not required to trade, but is needed to claim AfCFTA preferential duty.
insert into public.destination_requirements (destination_country, hs_code, certificate, is_mandatory, notes)
values ('KE', null, 'certificate_of_origin', false, 'Needed to claim AfCFTA preferential duty'),
       ('GH', null, 'certificate_of_origin', false, 'Needed to claim AfCFTA preferential duty'),
       ('NG', null, 'certificate_of_origin', false, 'Needed to claim AfCFTA preferential duty')
on conflict do nothing;
