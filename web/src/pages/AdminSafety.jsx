// OXL staff: safety signals and problem reports (Richmond, 13 Nov 2026).
// Signals come from automatic checks (prices far below the market, ID names that do not match, documents the AI
// flagged, pinned locations in another country) and from users' reports. Confirming one can place a safety alert,
// which every business in an open deal with that party is told about at once; a high alert also stops new matches.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { REPORT_CATEGORY, SafetyBadge } from '../components/Safety'
import { PageHeader, StatTile, EmptyState } from '../components/Page'

const SEV = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-gray-100 text-navy/70' }
const KIND = { price_far_below_market: 'Price far below the market', id_name_mismatch: 'Name on ID does not match', document_red_flags: 'Document flagged by the AI',
  location_inconsistent: 'Location does not match', reported_by_users: 'Reported by users' }

export default function AdminSafety() {
  const [flags, setFlags] = useState([])
  const [reports, setReports] = useState([])
  const [alerts, setAlerts] = useState([])
  const [notes, setNotes] = useState({})
  const [msg, setMsg] = useState(null)
  const load = () => {
    supabase.from('risk_flags').select('*, org:organisations(id, name, country, safety_alert)').eq('status', 'open')
      .order('created_at', { ascending: false }).then(({ data }) => setFlags((data ?? []).sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity))))
    supabase.from('problem_reports').select('*, reporter:organisations!problem_reports_reporter_org_id_fkey(name), reported:organisations!problem_reports_reported_org_id_fkey(id, name)')
      .in('status', ['new', 'investigating']).order('created_at', { ascending: false }).then(({ data }) => setReports(data ?? []))
    supabase.from('organisations').select('id, name, country, safety_alert, safety_alert_note').not('safety_alert', 'is', null).then(({ data }) => setAlerts(data ?? []))
  }
  useEffect(() => { load() }, [])
  const note = (id) => notes[id]?.trim() || null
  async function run(p, ok) { setMsg(null); const { error } = await p; setMsg(error ? { err: error.message } : { ok }); load() }

  return (
    <div className="space-y-8">
      <PageHeader title="Safety" subtitle="Automatic signals and users' reports. A safety alert is shown on the business and sent to everyone in an open deal with it; a high alert also stops new matches." />
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Summary">
        <StatTile label="Open signals" value={flags.length} tone={flags.length ? 'warn' : 'ok'} hint={flags.length ? 'Review below' : 'Nothing open'} />
        <StatTile label="Open reports" value={reports.length} tone={reports.length ? 'warn' : 'ok'} hint={reports.length ? 'From users' : 'Nothing open'} />
        <StatTile label="Active safety alerts" value={alerts.length} tone={alerts.length ? 'bad' : 'ok'} hint={alerts.length ? 'Counterparties are told' : 'None placed'} />
      </section>
      {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Open signals <span className="text-navy/40">{flags.length}</span></h3>
        {flags.length === 0 && <EmptyState title="No open signals">Automatic checks have nothing to flag right now.</EmptyState>}
        {flags.map((f) => (
          <div key={f.id} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV[f.severity]}`}>{f.severity}</span>
              <b>{KIND[f.kind] ?? f.kind}</b><span className="text-sm">· <Link className="hover:underline" to={`/report/${f.org?.id}`}>{f.org?.name}</Link> ({f.org?.country})</span>
              <SafetyBadge alert={f.org?.safety_alert} />
              <span className="ml-auto text-xs text-navy/50">{f.source === 'report' ? 'from reports' : 'automatic'} · {new Date(f.updated_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-navy/80">{f.detail}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-full max-w-md py-1" placeholder="Note (kept on record; sent with an alert)" value={notes[f.id] ?? ''} onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })} />
              <button className="btn-ghost py-1" onClick={() => run(supabase.rpc('review_risk_flag', { p_flag: f.id, p_confirm: false, p_alert: null, p_note: note(f.id) }), 'Signal dismissed.')}>Dismiss</button>
              <button className="btn-ghost py-1" onClick={() => run(supabase.rpc('review_risk_flag', { p_flag: f.id, p_confirm: true, p_alert: null, p_note: note(f.id) }), 'Signal confirmed, no alert.')}>Confirm, no alert</button>
              <button className="btn-ghost py-1 text-amber-800" onClick={() => run(supabase.rpc('review_risk_flag', { p_flag: f.id, p_confirm: true, p_alert: 'caution', p_note: note(f.id) }), 'Caution alert placed; counterparties told.')}>Caution alert</button>
              <button className="btn-ghost py-1 text-red-700" onClick={() => run(supabase.rpc('review_risk_flag', { p_flag: f.id, p_confirm: true, p_alert: 'high', p_note: note(f.id) }), 'High alert placed; counterparties told and matching stopped.')}>High alert</button>
            </div>
          </div>))}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Reports from users <span className="text-navy/40">{reports.length}</span></h3>
        {reports.length === 0 && <EmptyState title="No open reports">Problems reported by users appear here.</EmptyState>}
        {reports.map((r) => (
          <div key={r.id} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <b>{REPORT_CATEGORY[r.category] ?? r.category}</b>
              <span className="text-sm">about <Link className="hover:underline" to={`/report/${r.reported?.id}`}>{r.reported?.name}</Link> · from {r.reporter?.name}</span>
              <span className="ml-auto text-xs text-navy/50">{r.status} · {new Date(r.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-navy/80">{r.description}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-full max-w-md py-1" placeholder="Note to the reporter" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              {r.status === 'new' && <button className="btn-ghost py-1" onClick={() => run(supabase.rpc('update_problem_report', { p_report: r.id, p_status: 'investigating', p_note: note(r.id) }), 'Marked as investigating; reporter told.')}>Investigating</button>}
              <button className="btn-ghost py-1" onClick={() => run(supabase.rpc('update_problem_report', { p_report: r.id, p_status: 'resolved', p_note: note(r.id) }), 'Resolved; reporter told.')}>Resolved</button>
              <button className="btn-ghost py-1" onClick={() => run(supabase.rpc('update_problem_report', { p_report: r.id, p_status: 'dismissed', p_note: note(r.id) }), 'Dismissed; reporter told.')}>Dismiss</button>
            </div>
          </div>))}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Businesses with a safety alert <span className="text-navy/40">{alerts.length}</span></h3>
        {alerts.length === 0 && <EmptyState title="No active alerts">An alert you place on a business appears here.</EmptyState>}
        {alerts.map((o) => (
          <div key={o.id} className="card flex flex-wrap items-center gap-3 text-sm">
            <SafetyBadge alert={o.safety_alert} /><Link className="font-medium hover:underline" to={`/report/${o.id}`}>{o.name}</Link>
            <span className="flex-1 text-navy/60">{o.safety_alert_note}</span>
            {o.safety_alert === 'caution' && <button className="btn-ghost py-1 text-red-700" onClick={() => run(supabase.rpc('set_safety_alert', { p_org: o.id, p_alert: 'high', p_note: o.safety_alert_note }), 'Raised to high.')}>Raise to high</button>}
            <button className="btn-ghost py-1" onClick={() => run(supabase.rpc('set_safety_alert', { p_org: o.id, p_alert: null, p_note: null }), 'Alert lifted; counterparties told.')}>Lift alert</button>
          </div>))}
      </section>
    </div>
  )
}
