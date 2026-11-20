import { SafetyBadge } from '../components/Safety'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLE_LABEL, TIER_LABEL, ENTITY_LABEL } from '../supabase'
import { DemoBadge, TierBadge } from '../components/Badges'
import { PageHeader, EmptyState, Avatar } from '../components/Page'

const TIER_ORDER = ['field_verified', 'registry_checked', 'documents_checked', 'self_declared']

export default function Directory() {
  const [orgs, setOrgs] = useState([])
  const [agents, setAgents] = useState({})
  const [countries, setCountries] = useState([])
  const [commodities, setCommodities] = useState([])
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [role, setRole] = useState('')
  const [hs, setHs] = useState('')
  const [minTier, setMinTier] = useState('')

  useEffect(() => {
    supabase.from('organisations').select('*, business_categories(code, name)').eq('is_suspended', false).order('name').then(({ data }) => setOrgs(data ?? []))
    supabase.from('agent_profiles').select('*').then(({ data }) => setAgents(Object.fromEntries((data ?? []).map((a) => [a.org_id, a]))))
    supabase.from('countries').select('*').order('is_pilot', { ascending: false }).order('name').then(({ data }) => setCountries(data ?? []))
    supabase.from('commodities').select('*').eq('is_active', true).order('name').then(({ data }) => setCommodities(data ?? []))
  }, [])
  const hsName = useMemo(() => Object.fromEntries(commodities.map((c) => [c.hs_code, c.name])), [commodities])

  const list = useMemo(() => orgs.filter((o) => {
    const text = `${o.name} ${o.city ?? ''} ${o.description ?? ''} ${o.business_categories?.name ?? ''} ${(o.hs_codes ?? []).map((c) => hsName[c] ?? '').join(' ')} ${(agents[o.id]?.areas_covered ?? []).join(' ')}`.toLowerCase()
    return (!country || o.country === country) && (!role || o.role === role) && (!hs || (o.hs_codes ?? []).includes(hs))
      && (!minTier || TIER_ORDER.indexOf(o.verification_tier) <= TIER_ORDER.indexOf(minTier))
      && (!q || text.includes(q.toLowerCase()))
  }), [orgs, agents, hsName, q, country, role, hs, minTier])

  const filtersOn = !!(q || country || role || hs || minTier)
  const clear = () => { setQ(''); setCountry(''); setRole(''); setHs(''); setMinTier('') }

  return (
    <section className="space-y-6">
      <PageHeader title="Database" subtitle="Businesses, agents, lenders and partners on OXL. Verification levels are set by OXL staff." />

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="relative">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="input pl-9" type="search" aria-label="Search the database" placeholder="Search name, town, product, area…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select className="input" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" aria-label="Commodity" value={hs} onChange={(e) => setHs(e.target.value)}>
          <option value="">All commodities</option>{commodities.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name}</option>)}
        </select>
        <select className="input" aria-label="Verification level" value={minTier} onChange={(e) => setMinTier(e.target.value)}>
          <option value="">Any verification</option>{TIER_ORDER.slice(0, 3).map((t) => <option key={t} value={t}>{TIER_LABEL[t]} or higher</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between text-sm text-navy/70">
        <span>{list.length === orgs.length ? `${orgs.length} on OXL` : `${list.length} of ${orgs.length} shown`}</span>
        {filtersOn && <button className="font-medium text-terra hover:underline" onClick={clear}>Clear filters</button>}
      </div>

      {list.length === 0 && (
        <EmptyState title={orgs.length === 0 ? 'No businesses yet' : 'Nothing matches these filters'}
          action={filtersOn ? <button className="btn-ghost" onClick={clear}>Clear filters</button> : null}>
          {orgs.length === 0 ? 'Businesses appear here once they finish setting up their profile.' : 'Try a different product, country or verification level.'}
        </EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {list.map((o) => {
          const a = agents[o.id]
          return (
            <article key={o.id} className="card flex flex-col">
              <div className="flex items-start gap-3">
                <Avatar name={o.name} size={40} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-sans text-base font-semibold leading-snug">{o.name}</h3>
                  <div className="text-xs text-navy/70">{ROLE_LABEL[o.role]}{o.entity_type ? ` (${ENTITY_LABEL[o.entity_type]})` : ''}{a?.is_field_officer ? ` · OXL field officer${a.field_area ? `, ${a.field_area}` : ''}` : ''}</div>
                  <div className="text-xs text-navy/60">{o.city ? `${o.city}, ` : ''}{o.country}{o.year_established ? ` · since ${o.year_established}` : ''}</div>
                  <div className="mt-2 sm:hidden"><TierBadge tier={o.verification_tier} /></div>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex"><TierBadge tier={o.verification_tier} /><DemoBadge show={o.is_demo} /></div>
              </div>
              {(o.business_categories || o.geo_status === 'verified') && (
                <p className="mt-3 text-xs text-navy/60">{o.business_categories ? `${o.business_categories.code} · ${o.business_categories.name}` : ''}
                  {o.geo_status === 'verified' && <span className="ml-2 font-medium text-leaf">✓ Location confirmed by OXL</span>}</p>)}
              {o.safety_alert && <p className="mt-2"><SafetyBadge alert={o.safety_alert} /> <span className="text-xs text-navy/60">{o.safety_alert === 'high' ? 'Do not pay or ship until OXL contacts you.' : 'Confirm details through OXL before paying or shipping.'}</span></p>}
              {o.description && <p className="mt-3 text-sm leading-relaxed text-navy/80">{o.description}</p>}
              {(o.hs_codes ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">{o.hs_codes.map((c) => <span key={c} className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs">{hsName[c] ?? `HS ${c}`}</span>)}</div>
              )}
              {a && (
                <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                  {a.areas_covered?.length > 0 && <><dt className="text-navy/60">Areas</dt><dd>{a.areas_covered.join(', ')}</dd></>}
                  {a.typical_fee_note && <><dt className="text-navy/60">Usual fee</dt><dd>{a.typical_fee_note}</dd></>}
                  {a.endorsing_body && <><dt className="text-navy/60">Endorsed by</dt><dd>{a.endorsing_body}</dd></>}
                </dl>
              )}
              {['exporter', 'importer'].includes(o.role) && (
                <div className="mt-auto pt-4">
                  <div className="border-t border-line pt-3">
                    <Link to={`/report/${o.id}`} className="text-sm font-medium text-terra hover:underline">View trust report →</Link>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
