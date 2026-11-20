import { useEffect, useState } from 'react'
import { GeoBadge } from '../components/LocationCard'
import { ReportProblem, SafetyBadge } from '../components/Safety'
import { useParams } from 'react-router-dom'
import { supabase, ROLE_LABEL, FINANCE_TYPE_LABEL } from '../supabase'
import { useAuth } from '../App'
import { DemoBadge, ScoreFactors, TierBadge } from '../components/Badges'

const BAND_TEXT = { A: 'Strong evidence base', B: 'Good, some gaps', C: 'Limited evidence', D: 'Mostly unverified' }

export default function RiskReport() {
  const { orgId } = useParams()
  const { org } = useAuth()
  const [r, setR] = useState(null)
  const [err, setErr] = useState(null)
  const [alert, setAlert] = useState(null)
  const [reporting, setReporting] = useState(false)
  useEffect(() => {
    supabase.from('organisations').select('safety_alert').eq('id', orgId).maybeSingle().then(({ data }) => setAlert(data?.safety_alert ?? null))
    setR(null); setErr(null)
    supabase.rpc('risk_report', { p_org_id: orgId }).then(({ data, error }) => error ? setErr(error.message) : setR(data))
  }, [orgId])
  const own = org?.id === orgId

  if (err) return (
    <div className="card max-w-xl">
      <h2 className="text-xl font-semibold">Risk report not available</h2>
      <p className="mt-2 text-sm text-navy/70">{err}. The organisation must share its report with you first; you can still express interest from the matches list.</p>
    </div>
  )
  if (!r) return <p className="text-navy/60">Loading report…</p>
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-navy/50">Counterparty risk report</p>
            <h2 className="text-2xl font-semibold">{r.org_name} <DemoBadge show={r.is_demo} /> <SafetyBadge alert={alert} /></h2>
            <p className="text-sm text-navy/60">{ROLE_LABEL[r.role]} · {r.country}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold tabular-nums">{r.score}<span className="text-lg text-navy/40">/100</span></div>
            <div className="text-sm"><b>Band {r.band}</b> · {BAND_TEXT[r.band]}</div>
          </div>
        </div>
        <div className="mt-6"><ScoreFactors factors={r.factors} /></div>
        <Evidence orgId={orgId} />
        {!own && org && (reporting
          ? <ReportProblem reporterOrgId={org.id} reported={{ id: orgId, name: r.org_name }} onClose={() => setReporting(false)} />
          : <button className="mt-4 text-sm text-red-700/80 hover:text-red-700" onClick={() => setReporting(true)}>Report a problem with {r.org_name}</button>)}
        <p className="mt-6 border-t border-line pt-3 text-xs text-navy/50">{r.disclaimer} Generated {new Date(r.generated_at).toLocaleString()}.</p>
      </div>
      {own && <ShareControls orgId={orgId} />}
    </div>
  )
}

// Who may see my report: every active financier, with the reasons to choose one (trust level, what it finances)
const TIER_RANK = { field_verified: 3, registry_checked: 2, documents_checked: 1, self_declared: 0 }
const usd = (n) => `$${Number(n).toLocaleString()}`

function fitOf(fi, me, req) {
  const tags = []
  const hs = fi.lending_hs_codes ?? [], cs = fi.lending_countries ?? [], types = fi.lending_types ?? []
  const myHs = req?.hs_code ? [req.hs_code] : (me?.hs_codes ?? [])
  if (hs.length) {
    if (myHs.length === 0) tags.push({ t: 'Finances selected products', tone: 'plain' })
    else if (myHs.some((c) => hs.includes(c))) tags.push({ t: req?.hs_code ? 'Finances this product' : 'Finances your products', tone: 'ok' })
    else tags.push({ t: req?.hs_code ? 'Does not finance this product' : 'Does not list your products', tone: 'bad' })
  } else tags.push({ t: 'Finances all products', tone: 'plain' })
  if (cs.length) {
    const hit = cs.includes(me?.country) || (req?.destination_country && cs.includes(req.destination_country))
    tags.push(hit ? { t: 'Lends in your country', tone: 'ok' } : { t: `Not lending in ${me?.country ?? 'your country'}`, tone: 'bad' })
  }
  if (types.length && req?.finance_type) {
    tags.push(types.includes(req.finance_type) ? { t: 'Offers this type of finance', tone: 'ok' } : { t: 'Different type of finance', tone: 'bad' })
  }
  const min = fi.lending_min_usd != null ? Number(fi.lending_min_usd) : null, max = fi.lending_max_usd != null ? Number(fi.lending_max_usd) : null
  if (req?.amount_usd != null && (min != null || max != null)) {
    const a = Number(req.amount_usd)
    if (min != null && a < min) tags.push({ t: `Minimum ${usd(min)}`, tone: 'bad' })
    else if (max != null && a > max) tags.push({ t: `Maximum ${usd(max)}`, tone: 'bad' })
    else tags.push({ t: `Fits your ${usd(a)} request`, tone: 'ok' })
  } else if (min != null || max != null) {
    tags.push({ t: min != null && max != null ? `Requests ${usd(min)} to ${usd(max)}` : min != null ? `From ${usd(min)}` : `Up to ${usd(max)}`, tone: 'plain' })
  }
  return { tags, fits: !tags.some((x) => x.tone === 'bad') }
}

const TAG_STYLE = { ok: 'bg-leaf/10 text-leaf', bad: 'bg-red-50 text-red-700', plain: 'bg-navy/5 text-navy/70' }

function ShareControls({ orgId }) {
  const [fis, setFis] = useState([])
  const [shared, setShared] = useState(new Set())
  const [me, setMe] = useState(null)
  const [req, setReq] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)
  const load = async () => {
    const [{ data: f }, { data: s }, { data: o }, { data: r }] = await Promise.all([
      supabase.from('organisations').select('id, name, country, verification_tier, is_suspended, lending_hs_codes, lending_countries, lending_types, lending_min_usd, lending_max_usd').eq('role', 'financier').order('name'),
      supabase.from('report_shares').select('shared_with_org_id').eq('org_id', orgId),
      supabase.from('organisations').select('country, hs_codes').eq('id', orgId).single(),
      supabase.from('finance_requests').select('amount_usd, finance_type, hs_code, destination_country').eq('org_id', orgId).eq('status', 'open').order('created_at', { ascending: false }).limit(1),
    ])
    setFis((f ?? []).filter((x) => !x.is_suspended)); setShared(new Set((s ?? []).map((x) => x.shared_with_org_id)))
    setMe(o ?? null); setReq(r?.[0] ?? null)
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line
  async function toggle(fi) {
    setErr(null)
    if (shared.has(fi.id)) {
      const { error } = await supabase.from('report_shares').delete().eq('org_id', orgId).eq('shared_with_org_id', fi.id)
      if (error) setErr(error.message)
    } else {
      if ((TIER_RANK[fi.verification_tier] ?? 0) === 0 && !window.confirm(`${fi.name} has not been verified by OXL yet. Share your report and documents with it anyway?`)) return
      const { error } = await supabase.from('report_shares').insert({ org_id: orgId, shared_with_org_id: fi.id })
      if (error) setErr(error.message)
    }
    load()
  }
  const rows = fis.map((fi) => ({ fi, ...fitOf(fi, me, req) }))
    .filter(({ fi }) => !q.trim() || fi.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.fits - a.fits) || ((TIER_RANK[b.fi.verification_tier] ?? 0) - (TIER_RANK[a.fi.verification_tier] ?? 0)) || a.fi.name.localeCompare(b.fi.name))
  const fitting = rows.filter((x) => x.fits), others = rows.filter((x) => !x.fits)
  const row = ({ fi, tags }) => (
    <li key={fi.id} className="rounded-lg border border-line p-3">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={shared.has(fi.id)} onChange={() => toggle(fi)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{fi.name}</span><span className="text-xs text-navy/50">{fi.country}</span><TierBadge tier={fi.verification_tier} /></span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">{tags.map((x, i) => <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${TAG_STYLE[x.tone]}`}>{x.t}</span>)}</span>
        </span>
      </label>
    </li>
  )
  return (
    <div className="card h-fit space-y-3">
      <div>
        <h3 className="font-semibold">Share with financiers</h3>
        <p className="mt-1 text-xs text-navy/60">Only financiers you tick can see this report and your documents. You can withdraw at any time.</p>
        <p className="mt-1 text-xs text-navy/60">{shared.size === 0 ? 'Not shared with anyone yet.' : `Shared with ${shared.size} financier${shared.size === 1 ? '' : 's'}.`}</p>
      </div>
      {req && <p className="rounded-lg bg-navy/5 px-3 py-2 text-xs text-navy/70">Matched against your latest open request: {usd(req.amount_usd)}{req.finance_type ? `, ${FINANCE_TYPE_LABEL[req.finance_type]?.name.toLowerCase()}` : ''}.</p>}
      {fis.length > 8 && <input className="input" placeholder="Search financiers" value={q} onChange={(e) => setQ(e.target.value)} />}
      {fis.length === 0 && <p className="text-sm text-navy/60">No financiers are on OXL yet. They appear here once they join.</p>}
      {fitting.length > 0 && <div><h4 className="mb-2 text-xs font-semibold text-navy/70">Fit what you need</h4><ul className="space-y-2">{fitting.map(row)}</ul></div>}
      {others.length > 0 && <div><h4 className="mb-2 text-xs font-semibold text-navy/70">Other financiers</h4><ul className="space-y-2">{others.map(row)}</ul></div>}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  )
}

// Verification history and field visits (user story B3): who checked what, how and when
function Evidence({ orgId }) {
  const [hist, setHist] = useState([])
  const [visits, setVisits] = useState([])
  const [geo, setGeo] = useState(null)
  useEffect(() => {
    supabase.from('organisations').select('geo_status').eq('id', orgId).single().then(({ data }) => setGeo(data?.geo_status ?? 'none'))
    supabase.from('verifications').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).then(({ data }) => setHist(data ?? []))
    supabase.from('field_visits').select('visit_date, outcome, location_text, findings').eq('org_id', orgId).order('visit_date', { ascending: false }).then(({ data }) => setVisits(data ?? []))
  }, [orgId])
  return (
    <div className="mt-6 grid gap-6 border-t border-line pt-5 md:grid-cols-2">
      <div>
        <h3 className="font-semibold">Verification history</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {hist.length === 0 && <li className="text-navy/60">No entries.</li>}
          {hist.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <TierBadge tier={h.tier} /><span className="text-navy/70">{h.method}</span>
              <span className="ml-auto text-xs text-navy/50">{new Date(h.created_at).toLocaleDateString()}</span>
            </li>))}
        </ul>
      </div>
      <div>
        {geo && <p className="mb-3 text-sm">Business location: <GeoBadge status={geo} /></p>}
        <h3 className="font-semibold">Field visits</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {visits.length === 0 && <li className="text-navy/60">No field visit recorded yet.</li>}
          {visits.map((v, i) => (
            <li key={i}>
              <span className={`font-medium ${v.outcome === 'confirmed' ? 'text-leaf' : 'text-red-700'}`}>{v.outcome === 'confirmed' ? 'Confirmed' : v.outcome === 'concerns' ? 'Concerns found' : 'Business not found'}</span>
              <span className="text-navy/60"> · {v.visit_date}{v.location_text ? ` · ${v.location_text}` : ''}</span>
              {v.findings && <div className="text-xs text-navy/70">{v.findings}</div>}
            </li>))}
        </ul>
      </div>
    </div>
  )
}
