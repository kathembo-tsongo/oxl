-- OXL MVP — document back-side support for two-sided IDs and licences
-- Keep the same visibility as the front: only the business, its agent, and OXL staff can see it.

alter type public.doc_type add value if not exists 'driving_licence';

alter table public.documents
  add column if not exists back_file_path text;

comment on column public.documents.back_file_path is
  'Optional second side of a two-sided identity document (e.g. national ID, driving licence). Visibility is the same as the front image because the document row and storage bucket are already limited by public.can_view_report(org_id).';

-- No new storage bucket is needed: the existing documents bucket policy already restricts reads to
-- the business itself, its agent, and OXL staff, never lenders. The back-side file is stored in the
-- same bucket and is gated by the same org-report visibility rule.
