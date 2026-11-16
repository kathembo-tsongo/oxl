import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local')

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

export const ROLE_LABEL = { exporter: 'Exporter', importer: 'Importer', agent: 'Agent / broker', financier: 'Financial institution', partner: 'Institutional partner' }
export const TIER_LABEL = { self_declared: 'Self-declared', documents_checked: 'Documents checked', registry_checked: 'Registry checked', field_verified: 'Field verified' }
export const DOC_LABEL = {
  business_registration: 'Business registration', export_licence: 'Export licence', tax_certificate: 'Tax compliance certificate',
  quality_certificate: 'Quality certificate', phytosanitary_certificate: 'Phytosanitary certificate', invoice: 'Past invoice',
  national_id: 'National ID or passport', broker_licence: 'Broker licence', code_of_conduct: 'Signed OXL code of conduct',
  member_list: 'Member / farmer list', representative_id: 'ID of a director or representative', other: 'Other',
}
// Identity documents: never shown to lenders; stored under '<org id>/identity/…'
export const IDENTITY_TYPES = ['national_id', 'representative_id']
// Which document types each kind of organisation is asked for
export const DOC_TYPES_FOR = {
  agent: ['national_id', 'broker_licence', 'business_registration', 'code_of_conduct', 'other'],
  default: ['business_registration', 'representative_id', 'export_licence', 'tax_certificate', 'quality_certificate', 'phytosanitary_certificate', 'invoice', 'other'],
  // by how a seller or buyer trades (organisations.entity_type)
  individual: ['national_id', 'export_licence', 'quality_certificate', 'phytosanitary_certificate', 'invoice', 'other'],
  enterprise: ['business_registration', 'representative_id', 'export_licence', 'tax_certificate', 'quality_certificate', 'phytosanitary_certificate', 'invoice', 'other'],
  cooperative: ['business_registration', 'representative_id', 'member_list', 'export_licence', 'quality_certificate', 'phytosanitary_certificate', 'invoice', 'other'],
  trader: ['national_id', 'business_registration', 'broker_licence', 'export_licence', 'tax_certificate', 'phytosanitary_certificate', 'invoice', 'other'],
}
export const docTypesFor = (org) => DOC_TYPES_FOR[org?.role === 'agent' ? 'agent' : org?.entity_type]
  ?? (['financier', 'partner'].includes(org?.role) ? ['business_registration', 'representative_id', 'tax_certificate', 'other'] : DOC_TYPES_FOR.default)

// Pinned business location: automatic check, then OXL review (Richmond, 13 Nov 2026)
export const GEO_LABEL = {
  none: 'Not pinned', auto_ok: 'Pinned · automatic check passed', auto_flagged: 'Pinned · needs a look',
  verified: 'Location confirmed by OXL', rejected: 'Location rejected by OXL',
}
export const GEO_STYLE = {
  none: 'bg-gray-100 text-navy/60', auto_ok: 'bg-sky-100 text-sky-800', auto_flagged: 'bg-amber-100 text-amber-800',
  verified: 'bg-leaf/10 text-leaf', rejected: 'bg-red-100 text-red-800',
}
export const mapsLink = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
export const earthLink = (lat, lon) => `https://earth.google.com/web/@${lat},${lon},300a,800d,35y,0h,0t,0r`

// How an exporter or importer trades (Richmond, 11 Nov 2026)
export const ENTITY_LABEL = { individual: 'Individual', enterprise: 'Registered enterprise', cooperative: 'Cooperative / farmer group', trader: 'Trader / broker' }
export const ENTITY_HINT = {
  individual: 'I sell or buy for myself, not through a company',
  enterprise: 'A registered business trading its own goods',
  cooperative: 'A group selling its members\u2019 produce',
  trader: 'I trade produce that belongs to others, for a commission',
}
export const CONSENT_LABEL = { in_app: 'Given in the app', signed_form: 'Signed consent form', recorded_verbal: 'Recorded verbal consent' }
export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP']

// Certificates sellers can hold and buyers can ask for (keys match destination_requirements.certificate)
export const CERT_LABEL = {
  phytosanitary: 'Phytosanitary', certificate_of_origin: 'Certificate of origin', organic: 'Organic', fairtrade: 'Fairtrade',
  rainforest_alliance: 'Rainforest Alliance', globalgap: 'GlobalG.A.P.', haccp: 'HACCP / food safety',
}
export const TRANSPORT_LABEL = { any: 'Any', sea: 'Sea', road: 'Road', air: 'Air' }
// Common grade names per commodity, offered as suggestions (users can still type their own)
export const GRADE_SUGGESTIONS = {
  '1801': ['Grade I', 'Grade II', 'Sub-standard'], '0801': ['RCN (raw)', 'W180', 'W240', 'W320', 'W450', 'Splits'],
  '0901': ['AA', 'AB', 'PB', 'C', 'E', 'Robusta'], '0902': ['BP1', 'PF1', 'PD', 'D1', 'Fannings'],
  '0804': ['Hass, size 14–24', 'Fuerte', 'Kent mango', 'Apple mango', 'MD2 pineapple'], '1515': ['Grade A (unrefined)', 'Grade B', 'Refined'],
  '1207': ['Whitish 99/1/1', 'Mixed', 'Natural'], '1005': ['White maize, Grade 1', 'Yellow maize, Grade 1', 'Grade 2'],
  '0713': ['Soybeans', 'Cowpeas', 'Green grams', 'Red kidney beans'], '1803': ['Natural cocoa liquor', 'Alkalised'],
  '0603': ['Roses, 50–60 cm', 'Summer flowers'], '0910': ['Dried ginger, split', 'Fresh ginger', 'Turmeric fingers'],
}
