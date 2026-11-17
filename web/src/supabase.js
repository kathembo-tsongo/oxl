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
  national_id: 'National ID', driving_licence: 'Driving licence', broker_licence: 'Broker licence', code_of_conduct: 'Signed OXL code of conduct',
  member_list: 'Member / farmer list', representative_id: 'ID of a director or representative', other: 'Other',
}
// Identity documents: never shown to lenders; stored under '<org id>/identity/…'
export const IDENTITY_TYPES = ['national_id', 'driving_licence', 'representative_id']
// Which document types each kind of organisation is asked for
export const DOC_TYPES_FOR = {
  agent: ['national_id', 'driving_licence', 'broker_licence', 'business_registration', 'code_of_conduct', 'other'],
  default: ['business_registration', 'representative_id', 'national_id', 'driving_licence', 'export_licence', 'tax_certificate', 'quality_certificate', 'phytosanitary_certificate', 'invoice', 'other'],
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
  // goods beyond farming (Richmond, 13 Nov 2026)
  conformity: 'Certificate of conformity (e.g. KEBS PVoC)', standards_mark: 'National standards mark (KEBS, GSA…)',
  product_registration: 'Product registration (e.g. FDA Ghana, PPB Kenya)', lab_test: 'Laboratory test report',
  iso_9001: 'ISO 9001 quality management', halal: 'Halal',
}
// Which certificates to offer for which kind of product (all stay available in the certificate rules)
const FARM_CERTS = ['phytosanitary', 'certificate_of_origin', 'organic', 'fairtrade', 'rainforest_alliance', 'globalgap', 'haccp', 'lab_test', 'halal']
const GOODS_CERTS = ['certificate_of_origin', 'conformity', 'standards_mark', 'product_registration', 'lab_test', 'iso_9001', 'halal']
export const certsFor = (category) => (category === 'farm' ? FARM_CERTS : category === 'processed' ? [...new Set([...FARM_CERTS, ...GOODS_CERTS])] : category ? GOODS_CERTS : Object.keys(CERT_LABEL))
// Unit of sale per product (commodities.unit)
export const UNIT_LABEL = { t: 'tonnes', kg: 'kg', pieces: 'pieces', cartons: 'cartons', bags: 'bags', litres: 'litres', m3: 'cubic metres', metres: 'metres' }
export const UNIT_SHORT = { t: 't', kg: 'kg', pieces: 'pcs', cartons: 'cartons', bags: 'bags', litres: 'L', m3: 'm³', metres: 'm' }
export const CATEGORY_LABEL = { farm: 'Farm produce', processed: 'Processed food and drinks', manufactured: 'Manufactured goods', mineral: 'Minerals and metals', other: 'Other' }
export const TRANSPORT_LABEL = { any: 'Any', sea: 'Sea', road: 'Road', air: 'Air' }
