-- Individual products inherit the grades and destination rules of the broad heading they came from.
-- This is a starting point: OXL staff should review them under Reference data.
do $$
declare
  m record; child text; tbl text; cols text; sel text; n int;
begin
  for m in
    select * from (values
      ('0910', array['090411','090421','090510','090611','090710','090811','090831','091011','091012','091030']::text[]),
      ('0804', array['080430','080440','080450']::text[]),
      ('0713', array['071310','071320','071333','071335','071340']::text[]),
      ('1207', array['120740','120710','120730']::text[])
    ) as t(parent, kids)
  loop
    foreach child in array m.kids loop
      continue when not exists (select 1 from public.commodities where hs_code = child);
      foreach tbl in array array['commodity_grades', 'destination_requirements'] loop
        execute format('select count(*) from public.%I where hs_code = %L', tbl, child) into n;
        continue when n > 0;
        select string_agg(quote_ident(column_name), ',' order by ordinal_position),
               string_agg(case when column_name = 'hs_code' then quote_literal(child) else quote_ident(column_name) end, ',' order by ordinal_position)
          into cols, sel
          from information_schema.columns
         where table_schema = 'public' and table_name = tbl
           and column_name <> 'id' and coalesce(is_identity, 'NO') = 'NO'
           and coalesce(column_default, '') not like 'nextval%' and is_generated = 'NEVER';
        execute format('insert into public.%I (%s) select %s from public.%I where hs_code = %L', tbl, cols, sel, tbl, m.parent);
      end loop;
    end loop;
  end loop;
end $$;

-- Retire the broad headings, now replaced by individual products.
update public.commodities set is_active = false where hs_code in ('0910', '0804', '0713', '1207');

-- Cashew, coffee and tea keep their original entries (and rules); hide the duplicates added with the product list.
update public.commodities set is_active = false where hs_code in ('080131', '080132', '090111', '090121', '090210', '090230');
