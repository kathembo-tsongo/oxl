import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, TIER_LABEL, ROLE_LABEL, ENTITY_LABEL } from '../supabase'
import { DocCard } from './Documents'
import { DemoBadge, TierBadge } from '../components/Badges'
import LocationMap from '../components/LocationMap'
import { GeoBadge, GeoFlags, GeoLinks } from '../components/LocationCard'

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
              <td>{o.country}</td><td>{ROLE_LABEL[o.role] ?? o.role}{o.entity_type ? <span className="text-xs text-navy/50"> ({ENTITY_LABEL[o.entity_type]})</span> : ''}</td>
              <td><TierBadge tier={o.verification_tier} /> {o.geo_status !== 'none' && <GeoBadge status={o.geo_status} />}</td>
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
  const [officer, setOfficer] = useState({ on: false, area: '' })
  useEffect(() => {
    if (o.role !== 'agent') return
    supabase.from('agent_profiles').select('is_field_officer, field_area').eq('org_id', o.id).maybeSingle()
      .then(({ data }) => setOfficer({ on: !!data?.is_field_officer, area: data?.field_area ?? '' }))
  }, [o.id, o.role])
  async function saveOfficer() {
    setMsg(null)
    const { error } = await supabase.from('agent_profiles').upsert({ org_id: o.id, is_field_officer: officer.on, field_area: officer.area || null })
    setMsg(error ? { err: error.message } : { ok: officer.on ? `Appointed as OXL field officer${officer.area ? ` for ${officer.area}` : ''}.` : 'No longer a field officer.' })
  }
  async function verifyFromVisit(x) {
    setMsg(null)
    const { error } = await supabase.rpc('set_verification_tier', { p_org_id: o.id, p_tier: 'field_verified',
      p_method: `Field visit on ${x.visit_date} by ${x.visitor_name}`, p_notes: x.findings || null })
    setMsg(error ? { err: error.message } : { ok: 'Level set to Field verified.' }); load(); onChanged()
  }
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
    <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-3">
      <IdentityStatus o={o} />
      <LocationReview o={o} visits={visits} onChanged={onChanged} />
      <AiPreCheck o={o} />
    </div>
    <div className="grid gap-6 border-t border-line pt-6 lg:grid-cols-3">
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
              {x.outcome === 'confirmed' && o.verification_tier !== 'field_verified' && (
                <button className="mt-1 text-terra" onClick={() => verifyFromVisit(x)}>Set Field verified from this visit</button>)}
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
        {o.role === 'agent' && (
          <div className="mt-5 border-t border-line pt-4">
            <h4 className="font-semibold">OXL field officer</h4>
            <p className="mt-1 text-xs text-navy/60">A field officer onboards farmers, leads a network of agents in an area, and records field visits for you to review.</p>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={officer.on} onChange={(e) => setOfficer({ ...officer, on: e.target.checked })} /> Appoint as field officer</label>
            <input className="input mt-2" placeholder="Area, e.g. Nairobi" value={officer.area} onChange={(e) => setOfficer({ ...officer, area: e.target.value })} />
            <button className="btn-ghost mt-2" onClick={saveOfficer}>Save</button>
          </div>
        )}
        {msg && <p className={`mt-2 text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      </div>
    </div>
    </div>
  )
}

// Identity documents: progress towards the requirement (OXL approves them in the queue above)
function IdentityStatus({ o }) {
  const [req, setReq] = useState(null)
  const [docs, setDocs] = useState([])
  useEffect(() => {
    supabase.rpc('identity_requirement', { p_org: o.id }).then(({ data }) => setReq(data?.[0] ?? null))
    supabase.from('documents').select('id, doc_type, holder_name, holder_role, review_status, extracted, storage_path')
      .eq('org_id', o.id).in('doc_type', ['national_id', 'representative_id']).order('created_at').then(({ data }) => setDocs(data ?? []))
  }, [o.id])
  async function view(d) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  return (
    <div>
      <h4 className="font-semibold">Identity</h4>
      {req && <p className={`mt-1 text-sm ${req.approved >= req.required ? 'text-leaf' : 'text-amber-800'}`}>
        {req.approved} of {req.required} approved · {req.kind === 'personal' ? 'own ID needed' : 'IDs of two directors or representatives needed'}</p>}
      <ul className="mt-2 space-y-2 text-xs">
        {docs.length === 0 && <li className="text-navy/60">No ID uploaded yet. The trust level cannot be raised until it is.</li>}
        {docs.map((d) => (
          <li key={d.id} className="rounded-lg bg-white p-2">
            <div className="flex justify-between gap-2"><b>{d.holder_name ?? d.extracted?.holder_name ?? 'National ID'}</b>
              <span className={d.review_status === 'approved' ? 'text-leaf' : d.review_status === 'rejected' ? 'text-red-700' : 'text-amber-700'}>{d.review_status}</span></div>
            <div className="text-navy/60">{d.holder_role ?? ''}{d.extracted?.id_number_last4 ? ` · …${d.extracted.id_number_last4}` : ''}{d.extracted?.name_matches === false ? ' · name does not match' : ''}</div>
            <button className="text-terra" onClick={() => view(d)}>Open file</button>
          </li>))}
      </ul>
    </div>
  )
}

// Pinned location: automatic check, field-visit GPS, OXL confirms or rejects
function LocationReview({ o, visits, onChanged }) {
  const [pin, setPin] = useState(undefined)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('org_locations').select('*').eq('org_id', o.id).maybeSingle().then(({ data }) => setPin(data ?? null))
  useEffect(() => { load() }, [o.id]) // eslint-disable-line
  async function review(ok) {
    setMsg(null)
    const { error } = await supabase.rpc('review_org_location', { p_org: o.id, p_ok: ok, p_note: note || null })
    setMsg(error ? { err: error.message } : { ok: ok ? 'Location confirmed.' : 'Location rejected; the business will see your note.' })
    if (!error) { load(); onChanged() }
  }
  if (pin === undefined) return null
  const km = (a, b, c, d) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return (12742 * Math.asin(Math.sqrt(h))).toFixed(1) }
  const gpsVisits = pin ? visits.filter((x) => x.lat != null) : []
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">Location</h4><GeoBadge status={o.geo_status} /></div>
      {!pin ? <p className="text-xs text-navy/60">Not pinned yet. The business, its agent or its field officer can pin it.</p> : <>
        <LocationMap lat={Number(pin.lat)} lon={Number(pin.lon)} accuracy={pin.accuracy_m} height={180} />
        <div className="text-xs text-navy/60">{pin.source === 'device' ? 'From the phone\'s GPS' : 'Clicked on the map'}{pin.accuracy_m ? ` · ±${pin.accuracy_m} m` : ''} · {new Date(pin.set_at).toLocaleDateString()}</div>
        <GeoLinks lat={Number(pin.lat)} lon={Number(pin.lon)} />
        <GeoFlags check={{ ...(pin.auto_check ?? {}), review_note: pin.review_note }} />
        {gpsVisits.map((x) => <div key={x.id} className="text-xs">Visit {x.visit_date} by {x.visitor_name}: GPS {km(Number(pin.lat), Number(pin.lon), Number(x.lat), Number(x.lon))} km from the pin</div>)}
        <input className="input" placeholder="Note (e.g. matches satellite view and visit)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2"><button className="btn-primary py-1" onClick={() => review(true)}>Confirm</button><button className="btn-ghost py-1 text-red-700" onClick={() => review(false)}>Reject</button></div>
      </>}
      {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
    </div>
  )
}

// AI pre-check: Claude reviews everything OXL holds about the organisation; staff decide
const RESULT_STYLE = { pass: 'bg-leaf/10 text-leaf', warn: 'bg-amber-100 text-amber-800', fail: 'bg-red-100 text-red-800', missing: 'bg-gray-100 text-navy/60' }
function AiPreCheck({ o }) {
  const [check, setCheck] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const load = () => supabase.from('org_ai_checks').select('*').eq('org_id', o.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setCheck(data ?? null))
  useEffect(() => { load() }, [o.id]) // eslint-disable-line
  async function run() {
    setBusy(true); setErr(null)
    const { error } = await supabase.functions.invoke('verify-organisation', { body: { org_id: o.id } })
    setBusy(false); if (error) setErr(error.message); load()
  }
  const r = check?.status === 'done' ? check.result ?? {} : null
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : [])
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">AI pre-check</h4>
        <button className="btn-ghost py-1" disabled={busy} onClick={run}>{busy ? 'Checking…' : check ? 'Run again' : 'Run AI pre-check'}</button></div>
      <p className="text-xs text-navy/60">Claude compares the profile, documents, IDs, location, visits and sanctions list. It advises; you decide.</p>
      {check === null && <p className="text-xs text-navy/60">Not run yet.</p>}
      {check?.status === 'failed' && <p className="text-xs text-red-700">Last run failed: {check.error}</p>}
      {r && <div className="space-y-2 text-xs">
        <p className="text-sm">{String(r.summary ?? '')}</p>
        <ul className="space-y-1">{arr(r.checks).map((c, i) => (
          <li key={i} className="flex gap-2"><span className={`h-fit rounded-full px-2 py-0.5 font-medium ${RESULT_STYLE[c.result] ?? RESULT_STYLE.missing}`}>{c.result}</span>
            <span><b className="capitalize">{String(c.area ?? '').replace('_', ' ')}</b>: {String(c.detail ?? '')}</span></li>))}</ul>
        {arr(r.red_flags).length > 0 && <div className="text-red-700">⚑ {arr(r.red_flags).join(' · ')}</div>}
        {arr(r.next_steps).length > 0 && <div><b>Next steps:</b> {arr(r.next_steps).join(' · ')}</div>}
        <div className="text-navy/60">Suggests: {TIER_LABEL[r.suggested_tier] ?? '—'} · confidence {r.confidence ?? '—'} · {new Date(check.created_at).toLocaleString()}</div>
      </div>}
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  )
}
