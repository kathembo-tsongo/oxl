-- Official sanctions lists loaded automatically (UN first). Manual entries (no external_ref) are never touched.
alter table public.sanctions_entries
  add column if not exists external_ref text,
  add column if not exists entry_kind text,
  add column if not exists is_alias boolean not null default false;
alter table public.sanctions_entries drop constraint if exists sanctions_entry_kind_ok;
alter table public.sanctions_entries add constraint sanctions_entry_kind_ok check (entry_kind is null or entry_kind in ('entity', 'individual'));
create index if not exists sanctions_entries_list on public.sanctions_entries (list_name);
create index if not exists sanctions_entries_name_trgm on public.sanctions_entries using gin (name_norm extensions.gin_trgm_ops);

create table if not exists public.sanctions_sync_log (
  id         uuid primary key default gen_random_uuid(),
  list_name  text not null,
  synced_at  timestamptz not null default now(),
  entries    integer not null,
  ok         boolean not null default true,
  message    text
);
alter table public.sanctions_sync_log enable row level security;
drop policy if exists sanctions_sync_log_admin on public.sanctions_sync_log;
create policy sanctions_sync_log_admin on public.sanctions_sync_log for select to authenticated using (public.is_oxl_admin());

-- Replace one official list in one step. Refuses a suspiciously small download so a bad fetch cannot empty the list.
create or replace function public.replace_sanctions_list(p_list text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer; v_in integer := case when jsonb_typeof(p_rows) = 'array' then jsonb_array_length(p_rows) else 0 end;
begin
  if v_in < 50 then
    insert into public.sanctions_sync_log (list_name, entries, ok, message) values (p_list, v_in, false, 'Only ' || v_in || ' entries received; the list was left unchanged');
    return -1;
  end if;
  delete from public.sanctions_entries where list_name = p_list and external_ref is not null;
  insert into public.sanctions_entries (name, country, list_name, listed_on, source_url, external_ref, entry_kind, is_alias)
  select trim(x->>'name'), null, p_list, nullif(x->>'listed_on', '')::date, nullif(x->>'source_url', ''), x->>'ref', x->>'kind', coalesce((x->>'alias')::boolean, false)
  from jsonb_array_elements(p_rows) x
  where coalesce(trim(x->>'name'), '') <> '';
  get diagnostics v_n = row_count;
  insert into public.sanctions_sync_log (list_name, entries, ok, message) values (p_list, v_n, true, null);
  return v_n;
end $$;
revoke all on function public.replace_sanctions_list(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_sanctions_list(text, jsonb) to service_role;

-- With thousands of entries, use the trigram index to narrow candidates before scoring them
create or replace function public.is_sanctioned_name(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_n text := public.normalise_party_name(p_name);
begin
  if v_n = '' then return false; end if;
  return exists (
    select 1 from public.sanctions_entries s
    where s.name_norm = v_n
       or (length(v_n) >= 8 and length(s.name_norm) >= 8 and s.name_norm % v_n and similarity(s.name_norm, v_n) >= 0.8));
end $$;
