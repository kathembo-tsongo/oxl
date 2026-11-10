import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, TIER_LABEL, ROLE_LABEL } from '../supabase'
import { DocCard } from './Documents'
import { DemoBadge, TierBadge } from '../components/Badges'

export default function Admin() {
  const [docs, setDocs] = useState([])
  const [orgs, setOrgs] = useState([])
  const [openOrg, setOpenOrg] = useState(null)
  const [q, setQ] = useState('')
  const load = () => {
    supabase.from('documents').select('*, organisations(name, country)').eq('review_status', 'pending').order('created_at').then(({ data }) => setDocs(data ?? []))
    supabase.from('organisations').select('*').order('created_at', { ascending: false }).then(({ data }) => setOrgs(data ?? []))
  }
  useEffect(() => { load() }, [])

  async function review(d, status) {
    const notes = status === 'rejected' ? prompt('Reason for rejection (shown to the organisation):') : null
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('documents').update({ review_status: status, review_notes: notes, reviewed_by: user.id }).eq('id', d.id)
    load()
  }
  async function view(d) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  async function setTier(o, tier) {
    const method = prompt(`How was ${o.name} verified as "${TIER_LABEL[tier]}"? (e.g. document review, BRS registry search, site visit)`)
    if (!method) return
    const { error } = await supabase.rpc('set_verification_tier', { p_org_id: o.id, p_tier: tier, p_method: method, p_notes: null })
    if (error) alert(error.message); load()
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-semibold">Documents awaiting review <span className="text-navy/40">{docs.length}</span></h2>
        <div className="mt-4 space-y-3">
          {docs.length === 0 && <div className="card text-sm text-navy/60">Queue is empty.</div>}
          {docs.map((d) => (
            <DocCard key={d.id} d={d}>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
                <span className="mr-auto text-navy/70">{d.organisations?.name} · {d.organisations?.country}</span>
                <button className="btn-ghost" onClick={() => view(d)}>Open file</button>
                <button className="btn-ghost" onClick={() => supabase.functions.invoke('extract-document', { body: { document_id: d.id } }).then(load)}>Re-run AI</button>
                <button className="btn-ghost text-red-700" onClick={() => review(d, 'rejected')}>Reject</button>
                <button className="btn-primary" onClick={() => review(d, 'approved')}>Approve</button>
              </div>
            </DocCard>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Organisations</h2>
        <input className="input mt-3 max-w-xs" placeholder="Search organisations…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="card mt-3 overflow-x-auto p-0">
        <table className="w-full min-w-[48rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Name</th><th>Country</th><th>Role</th><th>Tier</th><th>Set tier</th><th></th></tr></thead>
          <tbody>{orgs.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase())).map((o) => (
            <Fragment key={o.id}>
            <tr className="border-t border-line">
              <td className="px-4 py-2"><Link className="hover:underline" to={`/report/${o.id}`}>{o.name}</Link> <DemoBadge show={o.is_demo} />
                {o.is_suspended && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">suspended</span>}</td>
              <td>{o.country}</td><td>{ROLE_LABEL[o.role] ?? o.role}</td><td><TierBadge tier={o.verification_tier} /></td>
              <td><select className="input py-1" value="" onChange={(e) => e.target.value && setTier(o, e.target.value)}>
                <option value="">Change…</option>{Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></td>
              <td className="pr-4 text-right"><button className="btn-ghost py-1" onClick={() => setOpenOrg(openOrg === o.id ? null : o.id)}>{openOrg === o.id ? 'Close' : 'Manage'}</button></td>
            </tr>
            {openOrg === o.id && <tr><td colSpan={6} className="bg-cream px-4 py-4"><OrgPanel o={o} onChanged={load} /></td></tr>}
            </Fragment>
          ))}</tbody>
        </table>
        </div>
      </section>
    </div>
  )
}

// History, field visits and suspension for one organisation (user stories O1, O2, O4)
function OrgPanel({ o, onChanged }) {
  const [hist, setHist] = useState([])
  const [visits, setVisits] = useState([])
  const [v, setV] = useState({ visit_date: new Date().toISOString().slice(0, 10), visitor_name: '', location_text: o.city ?? '', outcome: 'confirmed', findings: '', setTier: true })
  const [reason, setReason] = useState(o.suspended_reason ?? '')
  const [msg, setMsg] = useState(null)
  const load = () => {
    supabase.from('verifications').select('*').eq('org_id', o.id).order('created_at', { ascending: false }).then(({ data }) => setHist(data ?? []))
    supabase.from('field_visits').select('*').eq('org_id', o.id).order('visit_date', { ascending: false }).then(({ data }) => setVisits(data ?? []))
  }
  useEffect(() => { load() }, [o.id]) // eslint-disable-line

  async function addVisit(e) {
    e.preventDefault(); setMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('field_visits').insert({ org_id: o.id, visit_date: v.visit_date, visitor_name: v.visitor_name,
      location_text: v.location_text || null, outcome: v.outcome, findings: v.findings || null, recorded_by: user.id })
    if (error) { setMsg({ err: error.message }); return }
    if (v.setTier && v.outcome === 'confirmed') {
      const { error: tErr } = await supabase.rpc('set_verification_tier', { p_org_id: o.id, p_tier: 'field_verified',
        p_method: `Field visit on ${v.visit_date} by ${v.visitor_name}`, p_notes: v.findings || null })
      if (tErr) { setMsg({ err: tErr.message }); return }
    }
    setMsg({ ok: 'Field visit recorded.' }); setV({ ...v, visitor_name: '', findings: '' }); load(); onChanged()
  }
  async function suspend(on) {
    setMsg(null)
    if (on && !reason.trim()) { setMsg({ err: 'Give a reason for the suspension.' }); return }
    const { error } = await supabase.from('organisations').update({ is_suspended: on, suspended_reason: on ? reason : null }).eq('id', o.id)
    setMsg(error ? { err: error.message } : { ok: on ? 'Suspended. It no longer appears in the directory or in matching.' : 'Reinstated.' }); onChanged()
  }
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div>
        <h4 className="font-semibold">Verification history</h4>
        <ul className="mt-2 space-y-2 text-xs">
          {hist.length === 0 && <li className="text-navy/60">No entries.</li>}
          {hist.map((h) => (
            <li key={h.id} className="rounded-lg bg-white p-2">
              <div className="flex items-center justify-between gap-2"><TierBadge tier={h.tier} /><span className="text-navy/50">{new Date(h.created_at).toLocaleDateString()}</span></div>
              <div className="mt-1 text-navy/70">{h.method}{h.notes ? ` · ${h.notes}` : ''}</div>
            </li>))}
        </ul>
      </div>
      <div>
        <h4 className="font-semibold">Field visits</h4>
        <ul className="mt-2 space-y-2 text-xs">
          {visits.map((x) => (
            <li key={x.id} className="rounded-lg bg-white p-2">
              <div className="flex justify-between"><b className={x.outcome === 'confirmed' ? 'text-leaf' : 'text-red-700'}>{x.outcome.replace('_', ' ')}</b><span className="text-navy/50">{x.visit_date}</span></div>
              <div className="text-navy/70">{x.visitor_name}{x.location_text ? ` · ${x.location_text}` : ''}</div>
              {x.findings && <div className="mt-1 text-navy/70">{x.findings}</div>}
            </li>))}
        </ul>
        <form onSubmit={addVisit} className="mt-3 grid gap-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" required value={v.visit_date} onChange={set('visit_date')} />
            <select className="input" value={v.outcome} onChange={set('outcome')}><option value="confirmed">Confirmed</option><option value="concerns">Concerns found</option><option value="not_found">Business not found</option></select>
          </div>
          <input className="input" required placeholder="Field officer name" value={v.visitor_name} onChange={set('visitor_name')} />
          <input className="input" placeholder="Place visited" value={v.location_text} onChange={set('location_text')} />
          <textarea className="input" rows={2} placeholder="Findings (e.g. warehouse seen, stock about 20 t, manager met)" value={v.findings} onChange={set('findings')} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={v.setTier} onChange={(e) => setV({ ...v, setTier: e.target.checked })} /> If confirmed, set level to Field verified</label>
          <button className="btn-primary">Record visit</button>
        </form>
      </div>
      <div>
        <h4 className="font-semibold">Suspension</h4>
        <p className="mt-1 text-xs text-navy/60">A suspended business or agent disappears from the directory and matching, and agents lose access to their clients.</p>
        <textarea className="input mt-2" rows={2} placeholder="Reason (kept on record)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {o.is_suspended
          ? <button className="btn-ghost mt-2" onClick={() => suspend(false)}>Reinstate</button>
          : <button className="btn-ghost mt-2 text-red-700" onClick={() => suspend(true)}>Suspend</button>}
        {msg && <p className={`mt-2 text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      </div>
    </div>
  )
}
