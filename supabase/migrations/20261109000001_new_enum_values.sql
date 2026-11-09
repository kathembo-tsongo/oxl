-- OXL MVP — Week 1 (tasks 3–4), part 1 of 2: new enum values.
-- Kept in its own migration because PostgreSQL cannot use a new enum value
-- in the same transaction that adds it.

-- Agents and brokers become the fifth user group (Conceptual Design §3)
alter type public.org_role add value if not exists 'agent';

-- Deals are tracked until delivery (§4, §7.3)
alter type public.interest_status add value if not exists 'in_transit';
alter type public.interest_status add value if not exists 'delivered';
alter type public.interest_status add value if not exists 'cancelled';

-- Documents agents must provide when they register (§3.2)
alter type public.doc_type add value if not exists 'national_id';
alter type public.doc_type add value if not exists 'broker_licence';
alter type public.doc_type add value if not exists 'code_of_conduct';
