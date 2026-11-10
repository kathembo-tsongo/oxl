import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLE_LABEL, TIER_LABEL } from '../supabase'
import { DemoBadge, TierBadge } from '../components/Badges'

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
    supabase.from('organisations').select('*').eq('is_suspended', false).order('name').then(({ data }) => setOrgs(data ?? []))
    supabase.from('agent_profiles').select('*').then(({ data }) => setAgents(Object.fromEntries((data ?? []).map((a) => [a.org_id, a]))))
    supabase.from('countries').select('*').order('is_pilot', { ascending: false }).order('name').then(({ data }) => setCountries(data ?? []))
    supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? []))
  }, [])
  const hsName = useMemo(() => Object.fromEntries(commodities.map((c) => [c.hs_code, c.name])), [commodities])

  const list = useMemo(() => orgs.filter((o) => {
    const text = `${o.name} ${o.city ?? ''} ${o.description ?? ''} ${(o.hs_codes ?? []).map((c) => hsName[c] ?? '').join(' ')} ${(agents[o.id]?.areas_covered ?? []).join(' ')}`.toLowerCase()
    return (!country || o.country === country) && (!role || o.role === role) && (!hs || (o.hs_codes ?? []).includes(hs))
      && (!minTier || TIER_ORDER.indexOf(o.verification_tier) <= TIER_ORDER.indexOf(minTier))
      && (!q || text.includes(q.toLowerCase()))
  }), [orgs, agents, hsName, q, country, role, hs, minTier])

  return (
    <section>
      <h2 className="text-2xl font-semibold">Directory</h2>
      <p className="text-sm text-navy/60">Businesses, agents, lenders and partners on OXL. Verification levels are set by OXL staff.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, town, product, area…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[11rem]" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select className="input max-w-[14rem]" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-[12rem]" value={hs} onChange={(e) => setHs(e.target.value)}>
          <option value="">All commodities</option>{commodities.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name}</option>)}
        </select>
        <select className="input max-w-[13rem]" value={minTier} onChange={(e) => setMinTier(e.target.value)}>
          <option value="">Any verification</option>{TIER_ORDER.slice(0, 3).map((t) => <option key={t} value={t}>{TIER_LABEL[t]} or higher</option>)}
        </select>
      </div>
      <p className="mt-3 text-xs text-navy/50">{list.length} of {orgs.length} shown</p>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {list.map((o) => {
          const a = agents[o.id]
          return (
            <div key={o.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{o.name}</div>
                  <div className="text-xs text-navy/60">{ROLE_LABEL[o.role]} · {o.city ? `${o.city}, ` : ''}{o.country}{o.year_established ? ` · since ${o.year_established}` : ''}</div>
                </div>
                <div className="flex shrink-0 gap-1.5"><TierBadge tier={o.verification_tier} /><DemoBadge show={o.is_demo} /></div>
              </div>
              {o.description && <p className="mt-2 text-sm text-navy/70">{o.description}</p>}
              {(o.hs_codes ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">{o.hs_codes.map((c) => <span key={c} className="rounded-full bg-cream px-2 py-0.5 text-xs">{hsName[c] ?? `HS ${c}`}</span>)}</div>
              )}
              {a && (
                <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                  {a.areas_covered?.length > 0 && <><dt className="text-navy/50">Areas</dt><dd>{a.areas_covered.join(', ')}</dd></>}
                  {a.typical_fee_note && <><dt className="text-navy/50">Usual fee</dt><dd>{a.typical_fee_note}</dd></>}
                  {a.endorsing_body && <><dt className="text-navy/50">Endorsed by</dt><dd>{a.endorsing_body}</dd></>}
                </dl>
              )}
              {['exporter', 'importer'].includes(o.role) && <Link to={`/report/${o.id}`} className="mt-3 inline-block text-sm text-terra">Trust report →</Link>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
