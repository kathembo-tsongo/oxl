-- OXL MVP — Seller types: new document type for cooperatives and farmer groups.
-- Kept in its own migration: a new enum value cannot be used in the same transaction that adds it.
alter type public.doc_type add value if not exists 'member_list';
