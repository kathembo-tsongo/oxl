-- OXL MVP — document storage bucket and reference data

-- Private bucket; files stored as  <org_id>/<random>-<filename>
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "org uploads own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_org_id()::text);

create policy "org, admins and shared financiers read documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_view_report(((storage.foldername(name))[1])::uuid));

create policy "org deletes own documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_org_id()::text);
