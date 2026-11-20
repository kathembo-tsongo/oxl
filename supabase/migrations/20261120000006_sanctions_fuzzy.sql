-- Sanctions screening that tolerates spelling differences.
-- Before: a business was blocked only if its name equalled a listed name (ignoring capitals and edge spaces).
-- Now: names are normalised (accents, punctuation, legal endings such as Ltd/Limited/LLC, word order) and then
-- compared for equality or high similarity, so "Acme Trading Ltd" matches "ACME TRADING LIMITED" and "Trading, Acme".

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- 1. Normal form of a name: lower case, no accents or punctuation, legal endings dropped, words sorted
create or replace function public.normalise_party_name(p_name text) returns text
language plpgsql stable set search_path = public, extensions as $$
declare
  v_clean text := trim(regexp_replace(lower(unaccent(coalesce(p_name, ''))), '[^[:alnum:]]+', ' ', 'g'));
  v_out text;
begin
  select string_agg(tok, ' ' order by tok) into v_out
  from unnest(string_to_array(v_clean, ' ')) as tok
  where tok <> '' and tok not in ('ltd','limited','llc','llp','inc','incorporated','plc','co','company','corp','corporation','gmbh','sarl','sa','sas','ag','bv','nv','pty','pvt','pte');
  return coalesce(nullif(v_out, ''), v_clean);   -- a name made only of legal endings keeps its plain form
end $$;

-- 2. Keep a stored normal form on every sanctions entry
alter table public.sanctions_entries add column if not exists name_norm text;
create or replace function public.trg_sanctions_norm() returns trigger
language plpgsql set search_path = public, extensions as $$
begin new.name_norm := public.normalise_party_name(new.name); return new; end $$;
drop trigger if exists trg_sanctions_norm on public.sanctions_entries;
create trigger trg_sanctions_norm before insert or update of name on public.sanctions_entries
  for each row execute function public.trg_sanctions_norm();
update public.sanctions_entries set name_norm = public.normalise_party_name(name);
create index if not exists sanctions_entries_name_norm on public.sanctions_entries (name_norm);

-- 3. Is this name on the list? Equal after normalising, or very similar (names of 8+ characters only, to avoid false hits)
create or replace function public.is_sanctioned_name(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_n text := public.normalise_party_name(p_name);
begin
  if v_n = '' then return false; end if;
  return exists (
    select 1 from public.sanctions_entries s
    where s.name_norm = v_n
       or (length(v_n) >= 8 and length(s.name_norm) >= 8 and similarity(s.name_norm, v_n) >= 0.8));
end $$;

-- 4. Matching uses it. The check is changed inside the existing function so its other rules are untouched.
do $$
declare
  v_def text;
  v_old constant text := 'not exists (select 1 from public.sanctions_entries s where lower(trim(s.name)) in (lower(trim(seller.name)), lower(trim(buyer.name))))';
  v_new constant text := 'not (public.is_sanctioned_name(seller.name) or public.is_sanctioned_name(buyer.name))';
begin
  select pg_get_functiondef('public.evaluate_pair(public.offers, public.requests)'::regprocedure) into v_def;
  if position(v_old in v_def) = 0 then
    if position(v_new in v_def) > 0 then return; end if;   -- already changed
    raise exception 'evaluate_pair does not contain the expected sanctions check; nothing was changed';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- 5. Staff report: businesses on OXL that match the list. 'blocked' = excluded from matching now;
--    'review' = similar but below the blocking line, for a person to check (a close spelling is not proof of identity).
create or replace function public.sanctions_screen()
returns table (org_id uuid, org_name text, entry_name text, list_name text, similarity real, result text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_oxl_admin() then raise exception 'OXL staff only'; end if;
  return query
    select o.id, o.name, s.name, s.list_name, similarity(s.name_norm, public.normalise_party_name(o.name)),
           case when s.name_norm = public.normalise_party_name(o.name)
                  or (length(public.normalise_party_name(o.name)) >= 8 and length(s.name_norm) >= 8 and similarity(s.name_norm, public.normalise_party_name(o.name)) >= 0.8)
                then 'blocked' else 'review' end
    from public.organisations o
    join public.sanctions_entries s
      on s.name_norm = public.normalise_party_name(o.name)
      or (length(public.normalise_party_name(o.name)) >= 8 and length(s.name_norm) >= 8
          and similarity(s.name_norm, public.normalise_party_name(o.name)) >= 0.6)
    order by 5 desc, o.name;
end $$;
revoke all on function public.sanctions_screen() from public, anon;
grant execute on function public.sanctions_screen() to authenticated;
