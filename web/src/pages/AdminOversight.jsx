import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, TIER_LABEL, ROLE_LABEL } from '../supabase'

const TABS = [['overview', 'Overview'], ['deals', 'Deals'], ['activity', 'Activity log']]
const words = (s) => String(s ?? '').replace(/_/g, ' ')

export default function AdminOversight() {
  const [tab, setTab] = useState('overview')
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Oversight</h2>
        <p className="mt-1 text-sm text-navy/60">What is happening across the platform: who is on it, what is being traded, and what OXL staff have done.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-terra text-navy' : 'text-navy/50 hover:text-navy'}`}>{label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'deals' && <Deals />}
      {tab === 'activity' && <Activity />}
    </div>
  )
}

function Stat({ label, value, to, warn }) {
  const body = (
    <div className="card h-full">
      <div className={`text-3xl font-semibold ${warn && value > 0 ? 'text-amber-800' : ''}`}>{value ?? 0}</div>
      <div className="mt-1 text-sm text-navy/60">{label}</div>
    </div>
  )
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body
}

function Breakdown({ title, data, label }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="card">
      <h3 className="font-semibold">{title}</h3>
      {entries.length === 0 && <p className="mt-2 text-sm text-navy/60">Nothing yet.</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {entries.map(([k, n]) => (
          <li key={k} className="flex justify-between gap-3"><span className="capitalize">{label(k)}</span><b>{n}</b></li>
        ))}
      </ul>
    </div>
  )
}

function Overview() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_overview').then(({ data, error }) => (error ? setErr(error.message) : setD(data)))
  }, [])
  if (err) return <div className="card text-sm text-red-700">{err}</div>
  if (!d) return <div className="card text-sm text-navy/60">Loading…</div>
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Organisations" value={d.organisations_total} />
        <Stat label="New this week" value={d.new_organisations_7d} />
        <Stat label="Deals started this week" value={d.new_deals_7d} />
        <Stat label="Suspended" value={d.suspended} warn />
        <Stat label="Documents awaiting review" value={d.documents_awaiting_review} to="/admin" warn />
        <Stat label="Locations not yet reviewed" value={d.locations_not_reviewed} to="/admin" warn />
        <Stat label="Open problem reports" value={d.open_problem_reports} to="/admin/safety" warn />
        <Stat label="Safety alerts" value={d.safety_alerts} to="/admin/safety" warn />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Breakdown title="By role" data={d.organisations_by_role} label={(k) => ROLE_LABEL[k] ?? words(k)} />
        <Breakdown title="By trust level" data={d.organisations_by_tier} label={(k) => TIER_LABEL[k] ?? words(k)} />
        <Breakdown title="Deals by status" data={d.deals_by_status} label={words} />
      </div>
    </div>
  )
}

const STATUS_STYLE = { cancelled: 'bg-red-100 text-red-800', completed: 'bg-leaf/10 text-leaf', declined: 'bg-gray-100 text-navy/60', withdrawn: 'bg-gray-100 text-navy/60' }

function Deals() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.rpc('admin_deals', { p_status: null, p_limit: 300, p_offset: 0 }).then(({ data, error }) => (error ? setErr(error.message) : setRows(data ?? [])))
  }, [])
  if (err) return <div className="card text-sm text-red-700">{err}</div>
  if (!rows) return <div className="card text-sm text-navy/60">Loading…</div>
  const statuses = [...new Set(rows.map((r) => r.status))].sort()
  const shown = rows.filter((r) => (!status || r.status === status)
    && (!q || `${r.seller} ${r.buyer} ${r.commodity}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search business or commodity…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[12rem]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{words(s)}</option>)}
        </select>
        <span className="self-center text-sm text-navy/50">{shown.length} deal{shown.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[52rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50">
            <th className="px-4 py-2">Started</th><th>Commodity</th><th>Seller</th><th>Buyer</th><th>Agreed</th><th>Status</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-navy/60">No deals.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-4 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.commodity}</td>
                <td><Link className="hover:underline" to={`/report/${r.seller_id}`}>{r.seller}</Link></td>
                <td><Link className="hover:underline" to={`/report/${r.buyer_id}`}>{r.buyer}</Link>
                  {r.proposed_by_side && <div className="text-xs text-navy/50">offer made by the {r.proposed_by_side}</div>}</td>
                <td>{r.agreed_quantity_tonnes ? `${r.agreed_quantity_tonnes} t` : '—'}{r.agreed_price_usd_per_tonne ? ` · $${Number(r.agreed_price_usd_per_tonne).toLocaleString()}/t` : ''}
                  {r.seller_terms && <div className="text-xs text-navy/60">Terms: {r.seller_terms}</div>}</td>
                <td>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status] ?? 'bg-amber-100 text-amber-800'}`}>{words(r.status)}</span>
                  {r.cancelled_by && <div className="mt-1 text-xs text-navy/60">Cancelled by {r.cancelled_by}{r.cancelled_from_status ? ` (was ${words(r.cancelled_from_status)})` : ''}{r.cancel_reason ? `: ${r.cancel_reason}` : ''}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ACTION_LABEL = {
  tier_changed: 'Trust level changed', suspended: 'Suspended', reinstated: 'Reinstated',
  location_status_changed: 'Location status changed', location_reviewed: 'Location reviewed',
  safety_alert_changed: 'Safety alert changed', document_reviewed: 'Document reviewed',
  deal_cancelled_by_staff: 'Deal cancelled by staff', report_status_changed: 'Problem report updated',
  field_visit_recorded: 'Field visit recorded',
}
function detailText(a) {
  const x = a.detail ?? {}
  if (a.action === 'tier_changed') return `${TIER_LABEL[x.from] ?? words(x.from)} → ${TIER_LABEL[x.to] ?? words(x.to)}`
  return Object.entries(x)
    .filter(([k, v]) => v != null && v !== '' && !k.endsWith('_id'))
    .map(([k, v]) => `${words(k)}: ${words(v)}`).join(' · ')
}

const PAGE = 50
function Activity() {
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState(null)
  const load = (offset) => {
    setBusy(true)
    supabase.rpc('admin_audit', { p_limit: PAGE, p_offset: offset }).then(({ data, error }) => {
      setBusy(false)
      if (error) { setErr(error.message); return }
      setRows((r) => (offset === 0 ? data : [...r, ...data])); setMore((data ?? []).length === PAGE)
    })
  }
  useEffect(() => { load(0) }, []) // eslint-disable-line
  if (err) return <div className="card text-sm text-red-700">{err}</div>
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/60">Every action OXL staff take on a business is recorded here. Entries cannot be edited or removed.</p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50">
            <th className="px-4 py-2">When</th><th>Action</th><th>Business</th><th>Details</th><th>By</th></tr></thead>
          <tbody>
            {!busy && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-navy/60">No staff actions recorded yet.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className="px-4 py-2 whitespace-nowrap">{new Date(a.at).toLocaleString()}</td>
                <td className="font-medium">{ACTION_LABEL[a.action] ?? words(a.action)}</td>
                <td>{a.org_id && a.organisation ? <Link className="hover:underline" to={`/report/${a.org_id}`}>{a.organisation}</Link> : '—'}</td>
                <td className="text-navy/70">{detailText(a) || '—'}</td>
                <td>{a.actor_name ?? 'OXL staff'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {busy && <p className="text-sm text-navy/60">Loading…</p>}
      {more && !busy && <button className="btn-ghost" onClick={() => load(rows.length)}>Load more</button>}
    </div>
  )
}
