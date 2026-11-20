alter table public.organisations
  add column if not exists lending_hs_codes  text[] not null default '{}',
  add column if not exists lending_countries text[] not null default '{}',
  add column if not exists lending_types     text[] not null default '{}',
  add column if not exists lending_min_usd   numeric(14,2),
  add column if not exists lending_max_usd   numeric(14,2);
alter table public.organisations drop constraint if exists lending_range_ok;
alter table public.organisations add constraint lending_range_ok
  check (lending_min_usd is null or lending_max_usd is null or lending_min_usd <= lending_max_usd);

alter table public.finance_requests
  add column if not exists finance_type text,
  add column if not exists hs_code text,
  add column if not exists destination_country text,
  add column if not exists repay_days integer;
alter table public.finance_requests drop constraint if exists finance_type_ok;
alter table public.finance_requests add constraint finance_type_ok
  check (finance_type is null or finance_type in ('pre_export','purchase_order','invoice','working_capital','equipment','other'));
alter table public.finance_requests drop constraint if exists repay_days_ok;
alter table public.finance_requests add constraint repay_days_ok
  check (repay_days is null or repay_days between 1 and 1095);
