-- OXL MVP — reference data + DEMO data for the Kenya–Ghana pilot.
-- Every organisation below is FICTIONAL and flagged is_demo = true. Prices are illustrative only.
-- Run once after the migrations (Supabase SQL editor, or: psql "$DB_URL" -f supabase/seed.sql)

-- Countries: pilot pair + common counterparties
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

-- ── Demo organisations (fixed UUIDs so offers/requests can reference them) ──
insert into public.organisations (id, name, role, country, city, registration_no, year_established, description, hs_codes, verification_tier, is_demo) values
  -- Ghana exporters
  ('a0000000-0000-0000-0000-000000000001','Bono Cocoa Growers Union (demo)','exporter','GH','Sunyani','CS-DEMO-001',2009,'Farmer union aggregating Grade I cocoa from 1,200 smallholders in the Bono region.','{1801}','field_verified',true),
  ('a0000000-0000-0000-0000-000000000002','Volta Cashew Processors (demo)','exporter','GH','Ho','CS-DEMO-002',2016,'Raw and processed cashew kernels, W240 and W320 grades.','{0801}','registry_checked',true),
  ('a0000000-0000-0000-0000-000000000003','Northern Shea Women''s Co-op (demo)','exporter','GH','Tamale','CS-DEMO-003',2019,'Unrefined shea butter produced by women''s groups across 14 communities.','{1515}','documents_checked',true),
  ('a0000000-0000-0000-0000-000000000004','Kintampo Grains & Pulses (demo)','exporter','GH','Kintampo',null,2022,'Maize and soybean trader.','{1005,0713}','self_declared',true),
  -- Kenya exporters
  ('a0000000-0000-0000-0000-000000000011','Murang''a Avocado Growers (demo)','exporter','KE','Murang''a','PVT-DEMO-011',2014,'Hass avocado aggregator with GlobalG.A.P.-certified packhouse.','{0804}','field_verified',true),
  ('a0000000-0000-0000-0000-000000000012','Kericho Highlands Tea Traders (demo)','exporter','KE','Kericho','PVT-DEMO-012',2005,'CTC black tea, BP1 and PF1 grades, sold via Mombasa auction and direct.','{0902}','registry_checked',true),
  ('a0000000-0000-0000-0000-000000000013','Nyeri Coffee Collective (demo)','exporter','KE','Nyeri','PVT-DEMO-013',2011,'AA and AB washed Arabica from cooperative factories.','{0901}','documents_checked',true),
  ('a0000000-0000-0000-0000-000000000014','Eastern Pulses Kenya (demo)','exporter','KE','Machakos',null,2023,'Green grams and dry beans.','{0713}','self_declared',true),
  -- Importers / buyers
  ('a0000000-0000-0000-0000-000000000021','Nairobi Chocolate Works (demo)','importer','KE','Nairobi','PVT-DEMO-021',2017,'Bean-to-bar chocolate maker sourcing West African cocoa.','{1801,1803}','registry_checked',true),
  ('a0000000-0000-0000-0000-000000000022','Mombasa Nut Roasters (demo)','importer','KE','Mombasa','PVT-DEMO-022',2012,'Roasted and packaged cashew for East African retail.','{0801}','documents_checked',true),
  ('a0000000-0000-0000-0000-000000000023','Accra Beverage Distributors (demo)','importer','GH','Accra','CS-DEMO-023',2010,'Tea and coffee importer supplying supermarkets and hotels in Ghana.','{0902,0901}','registry_checked',true),
  ('a0000000-0000-0000-0000-000000000024','Kumasi Fresh Imports (demo)','importer','GH','Kumasi',null,2021,'Fresh produce importer for Ghanaian supermarkets.','{0804}','self_declared',true),
  ('a0000000-0000-0000-0000-000000000025','Lagos Cosmetics Ingredients (demo)','importer','NG','Lagos','RC-DEMO-025',2015,'Buys shea butter for cosmetics manufacturing.','{1515}','documents_checked',true),
  -- Financiers and partners
  ('a0000000-0000-0000-0000-000000000031','Savannah Trade Finance Bank (demo)','financier','GH','Accra','BOG-DEMO-031',1998,'Commercial bank with an SME trade finance desk.','{}','registry_checked',true),
  ('a0000000-0000-0000-0000-000000000032','Rift Valley Agri-Fintech (demo)','financier','KE','Nairobi','PVT-DEMO-032',2020,'Invoice and purchase-order finance for agribusiness SMEs.','{}','registry_checked',true),
  ('a0000000-0000-0000-0000-000000000041','West–East Agribusiness Chamber (demo)','partner','GH','Accra',null,2008,'Trade association connecting Ghanaian and Kenyan agribusinesses.','{}','registry_checked',true)
on conflict (id) do nothing;

-- ── Demo offers (exporters) ──
insert into public.offers (org_id, hs_code, grade, quantity_tonnes, price_usd_per_tonne, incoterm, origin_country, available_from, notes) values
  ('a0000000-0000-0000-0000-000000000001','1801','Grade I',50,7800,'FOB','GH','2026-11-15','Main crop 2026/27, fermented and sun-dried.'),
  ('a0000000-0000-0000-0000-000000000002','0801','W320',20,6900,'CIF','GH','2026-11-01','Vacuum-packed 50 lb cartons.'),
  ('a0000000-0000-0000-0000-000000000002','0801','W240',8,8200,'CIF','GH','2026-11-01',null),
  ('a0000000-0000-0000-0000-000000000003','1515','Unrefined Grade A',15,2600,'FOB','GH','2026-10-30','Sold in 25 kg cartons.'),
  ('a0000000-0000-0000-0000-000000000004','1005','White maize',200,330,'EXW','GH','2026-12-01',null),
  ('a0000000-0000-0000-0000-000000000011','0804','Hass, size 16–20',40,1900,'CIF','KE','2026-11-10','Reefer containers, 4 kg cartons.'),
  ('a0000000-0000-0000-0000-000000000012','0902','BP1',30,2800,'CIF','KE','2026-10-25',null),
  ('a0000000-0000-0000-0000-000000000012','0902','PF1',25,2600,'CIF','KE','2026-10-25',null),
  ('a0000000-0000-0000-0000-000000000013','0901','AA',12,7400,'FOB','KE','2026-12-05','Washed Arabica, cupping score 85+.'),
  ('a0000000-0000-0000-0000-000000000014','0713','Green grams',60,950,'FOB','KE','2026-11-20',null);

-- ── Demo requests (importers) ──
insert into public.requests (org_id, hs_code, grade, quantity_tonnes, target_price_usd_per_tonne, incoterm, destination_country, needed_by, notes) values
  ('a0000000-0000-0000-0000-000000000021','1801','Grade I',30,8000,'FOB','KE','2027-01-15','Looking for a 12-month supply relationship.'),
  ('a0000000-0000-0000-0000-000000000022','0801','W320',25,6500,'CIF','KE','2026-12-20',null),
  ('a0000000-0000-0000-0000-000000000023','0902','BP1',20,2900,'CIF','GH','2026-12-01','Monthly shipments preferred.'),
  ('a0000000-0000-0000-0000-000000000023','0901','AA',5,7600,'CIF','GH','2027-01-10',null),
  ('a0000000-0000-0000-0000-000000000024','0804','Hass, size 16–20',15,2000,'CIF','GH','2026-12-15','Need cold-chain to Kumasi.'),
  ('a0000000-0000-0000-0000-000000000025','1515','Unrefined Grade A',10,2500,'CIF','NG','2026-11-30',null);

-- ── Demo approved documents so the risk report shows realistic differences ──
insert into public.documents (org_id, doc_type, file_name, storage_path, review_status, extraction_status) values
  ('a0000000-0000-0000-0000-000000000001','business_registration','registration.pdf','demo/registration.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000001','export_licence','cocobod-licence.pdf','demo/licence.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000001','quality_certificate','quality.pdf','demo/quality.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000011','business_registration','registration.pdf','demo/registration.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000011','export_licence','hcd-licence.pdf','demo/licence.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000011','tax_certificate','kra-tcc.pdf','demo/tax.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000011','quality_certificate','globalgap.pdf','demo/quality.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000002','business_registration','registration.pdf','demo/registration.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000012','business_registration','registration.pdf','demo/registration.pdf','approved','done'),
  ('a0000000-0000-0000-0000-000000000012','export_licence','tea-board-licence.pdf','demo/licence.pdf','approved','done');

insert into public.verifications (org_id, tier, method, notes)
select id, verification_tier, 'demo seed', 'Seeded demo organisation' from public.organisations where is_demo;

-- Demo consents: two exporters have shared their risk reports with the demo financiers
insert into public.report_shares (org_id, shared_with_org_id) values
  ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000031'),
  ('a0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000032')
on conflict do nothing;

insert into public.finance_requests (org_id, amount_usd, purpose) values
  ('a0000000-0000-0000-0000-000000000001', 150000, 'Pre-export finance for 50 t cocoa to Nairobi'),
  ('a0000000-0000-0000-0000-000000000011', 40000, 'Cold-chain logistics for first avocado shipment to Ghana');
