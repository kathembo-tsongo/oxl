-- Grades: one canonical spelling per commodity, taken from commodity_grades.
-- Equivalent spellings ("Grade I", "grade one", "1st", "No. 1") are stored as the listed grade.

create or replace function public.normalise_grade(g text) returns text
language plpgsql immutable set search_path = public as $$
declare s text;
begin
  if g is null then return null; end if;
  s := lower(btrim(g));
  s := regexp_replace(s, '[.,;:_/-]+', ' ', 'g');
  s := regexp_replace(s, '(grade|class|no)(\d)', '\1 \2', 'g');
  s := regexp_replace(s, '\m(1st|first)\M', '1', 'g');
  s := regexp_replace(s, '\m(2nd|second)\M', '2', 'g');
  s := regexp_replace(s, '\m(3rd|third)\M', '3', 'g');
  s := regexp_replace(s, '\mone\M', '1', 'g');
  s := regexp_replace(s, '\mtwo\M', '2', 'g');
  s := regexp_replace(s, '\mthree\M', '3', 'g');
  s := regexp_replace(s, '\mfour\M', '4', 'g');
  s := regexp_replace(s, '\mfive\M', '5', 'g');
  s := regexp_replace(s, '\miii\M', '3', 'g');
  s := regexp_replace(s, '\mii\M', '2', 'g');
  s := regexp_replace(s, '\miv\M', '4', 'g');
  s := regexp_replace(s, '\mv\M', '5', 'g');
  s := regexp_replace(s, '\mi\M', '1', 'g');
  s := regexp_replace(s, '\m(no|class|gr|grd)\M', 'grade', 'g');
  s := regexp_replace(s, '(\mgrade\M ?){2,}', 'grade ', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  return btrim(s);
end $$;

-- One-time cleanup: rewrite existing grades that match a listed grade
update public.offers o set grade = g.grade_name
from public.commodity_grades g
where g.hs_code = o.hs_code and o.grade is not null
  and public.normalise_grade(g.grade_name) = public.normalise_grade(o.grade)
  and o.grade <> g.grade_name;

update public.requests r set grade = g.grade_name
from public.commodity_grades g
where g.hs_code = r.hs_code and r.grade is not null
  and public.normalise_grade(g.grade_name) = public.normalise_grade(r.grade)
  and r.grade <> g.grade_name;

-- From now on: store the canonical spelling, or refuse a grade that is not on the list
create or replace function public.trg_canonical_grade() returns trigger
language plpgsql set search_path = public as $$
declare canon text; allowed text;
begin
  if new.grade is null or btrim(new.grade) = '' then new.grade := null; return new; end if;
  if tg_op = 'UPDATE' and new.grade is not distinct from old.grade then return new; end if;
  select g.grade_name into canon from public.commodity_grades g
  where g.hs_code = new.hs_code and public.normalise_grade(g.grade_name) = public.normalise_grade(new.grade)
  order by g.sort_order limit 1;
  if canon is not null then new.grade := canon; return new; end if;
  select string_agg(g.grade_name, ', ' order by g.sort_order, g.grade_name) into allowed
  from public.commodity_grades g where g.hs_code = new.hs_code;
  if allowed is null then return new; end if;
  raise exception 'Grade "%" is not in the list for this commodity. Choose one of: %', new.grade, allowed;
end $$;

drop trigger if exists trg_canonical_grade on public.offers;
create trigger trg_canonical_grade before insert or update of grade, hs_code on public.offers
  for each row execute function public.trg_canonical_grade();

drop trigger if exists trg_canonical_grade on public.requests;
create trigger trg_canonical_grade before insert or update of grade, hs_code on public.requests
  for each row execute function public.trg_canonical_grade();
