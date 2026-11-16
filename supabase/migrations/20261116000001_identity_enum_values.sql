-- OXL MVP — Richmond's review (16 Nov 2026), part 1 of 2: new document type for the identity
-- documents of directors or representatives (enterprises, cooperatives, lenders, partners).
-- Kept in its own migration: a new enum value cannot be used in the same transaction that adds it.
alter type public.doc_type add value if not exists 'representative_id';
