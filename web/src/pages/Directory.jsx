import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLE_LABEL } from '../supabase'
import { DemoBadge, TierBadge } from '../components/Badges'

export default function Directory() {
  const [orgs, setOrgs] = useState([])
  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [role, setRole] = useState('')
  useEffect(() => { supabase.from('organisations').select('*').order('name').then(({ data }) => setOrgs(data ?? [])) }, [])
  const list = useMemo(() => orgs.filter((o) =>
    (!country || o.country === country) && (!role || o.role === role) &&
    (!q || `${o.name} ${o.city ?? ''} ${o.description ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [orgs, q, country, role])
  return (
    <section>
      <h2 className="text-2xl font-semibold">Directory</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, town, product…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[10rem]" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option><option value="KE">Kenya</option><option value="GH">Ghana</option><option value="NG">Nigeria</option>
        </select>
        <select className="input max-w-[14rem]" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {list.map((o) => (
          <div key={o.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{o.name}</div>
                <div className="text-xs text-navy/60">{ROLE_LABEL[o.role]} · {o.city ? `${o.city}, ` : ''}{o.country}{o.year_established ? ` · since ${o.year_established}` : ''}</div>
              </div>
              <div className="flex gap-1.5"><TierBadge tier={o.verification_tier} /><DemoBadge show={o.is_demo} /></div>
            </div>
            {o.description && <p className="mt-2 text-sm text-navy/70">{o.description}</p>}
            {['exporter', 'importer'].includes(o.role) && <Link to={`/report/${o.id}`} className="mt-3 inline-block text-sm text-terra">Risk report →</Link>}
          </div>
        ))}
      </div>
    </section>
  )
}
