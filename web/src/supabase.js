import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local')

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

export const ROLE_LABEL = { exporter: 'Exporter', importer: 'Importer', financier: 'Financial institution', partner: 'Institutional partner' }
export const TIER_LABEL = { self_declared: 'Self-declared', documents_checked: 'Documents checked', registry_checked: 'Registry checked', field_verified: 'Field verified' }
export const DOC_LABEL = {
  business_registration: 'Business registration', export_licence: 'Export licence', tax_certificate: 'Tax compliance certificate',
  quality_certificate: 'Quality certificate', phytosanitary_certificate: 'Phytosanitary certificate', invoice: 'Past invoice', other: 'Other',
}
export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP']
