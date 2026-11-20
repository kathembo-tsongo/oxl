-- Proof of consent (audio, photo or PDF) for producers a seller records. The file goes in the private
-- 'documents' bucket under '<seller org id>/consent/…', so the existing storage rules already apply:
-- the seller's own organisation and OXL staff can read it; nobody else can.
alter table public.seller_producers
  add column if not exists consent_file_path text,
  add column if not exists consent_file_name text;
