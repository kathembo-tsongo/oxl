// Profile: edit organisation details; agents edit their agent profile;
// traders link agents and control consent and document access (user stories S1, S7, A1)
import { useEffect, useState } from 'react'
import { supabase, ROLE_LABEL, CONSENT_LABEL } from '../supabase'
import { useAuth } from '../App'
import { TierBadge } from '../components/Badges'

export default function Profile() {
  const { org } = useAuth()
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">{org.name}</h2>
        <TierBadge tier={org.verification_tier} />
        <span className="text-sm text-navy/60">{ROLE_LABEL[org.role]}</span>
      </div>
      <OrgDetails />
      {org.role === 'agent' && <AgentDetails />}
      {['exporter', 'importer'].includes(org.role) && <MyAgents />}
      {['exporter', 'importer', 'agent'].includes(org.role) && <Memberships />}
    </div>
  )
}

function OrgDetails() {
  const { org, refresh } = useAuth()
  const [commodities, setCommodities] = useState([])
  const [f, setF] = useState({ name: org.name, city: org.city ?? '', registration_no: org.registration_no ?? '',
    year_established: org.year_established ?? '', description: org.description ?? '', hs_codes: org.hs_codes ?? [] })
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  useEffect(() => { supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? [])) }, [])
  const toggleHs = (c) => setF({ ...f, hs_codes: f.hs_codes.includes(c) ? f.hs_codes.filter((x) => x !== c) : [...f.hs_codes, c] })

  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('organisations').update({
      name: f.name, city: f.city || null, registration_no: f.registration_no || null,
      year_established: f.year_established ? Number(f.year_established) : null, description: f.description || null, hs_codes: f.hs_codes,
    }).eq('id', org.id)
    setMsg(error ? { err: error.message } : { ok: 'Profile saved.' })
    if (!error) refresh()
  }

  return (
    <form onSubmit={save} className="card grid gap-4 sm:grid-cols-2">
      <h3 className="sm:col-span-2 text-lg font-semibold">Profile details</h3>
      <div className="sm:col-span-2"><label className="label">Name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
      <div><label className="label">City / town</label><input className="input" value={f.city} onChange={set('city')} /></div>
      <div><label className="label">Registration number</label><input className="input" value={f.registration_no} onChange={set('registration_no')} /></div>
      <div><label className="label">{org.role === 'agent' ? 'Agent since' : 'Year established'}</label><input className="input" type="number" min="1900" max="2100" value={f.year_established} onChange={set('year_established')} /></div>
      <div><label className="label">Country</label><input className="input bg-cream" value={org.country} disabled /></div>
      <div className="sm:col-span-2"><label className="label">Description</label><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></div>
      {['exporter', 'importer', 'agent'].includes(org.role) && (
        <div className="sm:col-span-2"><label className="label">Commodities</label>
          <div className="flex flex-wrap gap-2">{commodities.map((c) => (
            <button type="button" key={c.hs_code} onClick={() => toggleHs(c.hs_code)}
              className={`rounded-full border px-3 py-1 text-xs ${f.hs_codes.includes(c.hs_code) ? 'border-leaf bg-leaf text-white' : 'border-line bg-white'}`}>{c.name}</button>))}</div></div>
      )}
      <p className="sm:col-span-2 text-xs text-navy/50">Role and verification level are set by OXL staff. Contact OXL to change them.</p>
      {msg && <p className={`sm:col-span-2 text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      <div className="sm:col-span-2"><button className="btn-primary">Save profile</button></div>
    </form>
  )
}

function AgentDetails() {
  const { org } = useAuth()
  const [p, setP] = useState(null)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    supabase.from('agent_profiles').select('*').eq('org_id', org.id).maybeSingle().then(({ data }) =>
      setP({ areas: (data?.areas_covered ?? []).join(', '), references_text: data?.references_text ?? '', endorsing_body: data?.endorsing_body ?? '',
        typical_fee_note: data?.typical_fee_note ?? '', signed: data?.code_of_conduct_signed_at ?? null, exists: !!data }))
  }, [org.id])
  if (!p) return null
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value })

  async function save(e) {
    e.preventDefault(); setMsg(null)
    const row = { org_id: org.id, areas_covered: p.areas.split(',').map((a) => a.trim()).filter(Boolean), references_text: p.references_text || null,
      endorsing_body: p.endorsing_body || null, typical_fee_note: p.typical_fee_note || null, code_of_conduct_signed_at: p.signed ?? new Date().toISOString() }
    const { error } = await supabase.from('agent_profiles').upsert(row)
    setMsg(error ? { err: error.message } : { ok: 'Agent profile saved.' })
  }

  return (
    <form onSubmit={save} className="card grid gap-4 sm:grid-cols-2">
      <h3 className="sm:col-span-2 text-lg font-semibold">Agent profile</h3>
      <div className="sm:col-span-2"><label className="label">Areas covered (separated by commas)</label><input className="input" value={p.areas} onChange={set('areas')} /></div>
      <div className="sm:col-span-2"><label className="label">References</label><textarea className="input" rows={2} value={p.references_text} onChange={set('references_text')} /></div>
      <div><label className="label">Endorsed by</label><input className="input" value={p.endorsing_body} onChange={set('endorsing_body')} /></div>
      <div><label className="label">Usual fee</label><input className="input" value={p.typical_fee_note} onChange={set('typical_fee_note')} /></div>
      <p className="sm:col-span-2 text-xs text-navy/60">Code of conduct {p.signed ? `accepted on ${new Date(p.signed).toLocaleDateString()}` : 'not yet accepted: saving this profile accepts it'}.</p>
      {msg && <p className={`sm:col-span-2 text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      <div className="sm:col-span-2"><button className="btn-primary">Save agent profile</button></div>
    </form>
  )
}

function MyAgents() {
  const { org } = useAuth()
  const [links, setLinks] = useState([])
  const [agents, setAgents] = useState([])
  const [pick, setPick] = useState('')
  const [err, setErr] = useState(null)

  const load = () => supabase.from('agent_clients')
    .select('*, agent:organisations!agent_clients_agent_org_id_fkey(id, name, country, city, verification_tier)')
    .eq('client_org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setLinks(data ?? []))
  useEffect(() => {
    load()
    supabase.from('organisations').select('id, name, country, city, verification_tier').eq('role', 'agent').eq('is_suspended', false).order('name')
      .then(({ data }) => setAgents(data ?? []))
  }, [org.id]) // eslint-disable-line

  async function act(fn) { setErr(null); const { error } = await fn(); if (error) setErr(error.message); load() }
  const linkAgent = () => {
    const existing = links.find((l) => l.agent_org_id === pick)
    return act(() => existing
      ? supabase.from('agent_clients').update({ withdrawn_at: null }).eq('id', existing.id)
      : supabase.from('agent_clients').insert({ agent_org_id: pick, client_org_id: org.id, consent_method: 'in_app' }))
  }
  const linkedIds = new Set(links.filter((l) => !l.withdrawn_at).map((l) => l.agent_org_id))

  return (
    <section className="card space-y-4">
      <div>
        <h3 className="text-lg font-semibold">My agents</h3>
        <p className="text-sm text-navy/60">Agents you allow to act for you: post listings, upload documents and introduce deals. You can stop this at any time.</p>
      </div>
      {links.length === 0 && <p className="text-sm text-navy/60">No agents linked.</p>}
      {links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{l.agent?.name} <TierBadge tier={l.agent?.verification_tier} /></div>
            <div className="text-xs text-navy/60">{CONSENT_LABEL[l.consent_method]} · {new Date(l.consent_given_at).toLocaleDateString()}
              {l.withdrawn_at && <span className="ml-1 font-medium text-red-700">· withdrawn {new Date(l.withdrawn_at).toLocaleDateString()}</span>}</div>
          </div>
          {!l.withdrawn_at && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={l.can_view_documents}
                  onChange={(e) => act(() => supabase.from('agent_clients').update({ can_view_documents: e.target.checked }).eq('id', l.id))} />
                Can see my documents
              </label>
              <button className="btn-ghost text-red-700" onClick={() => act(() => supabase.from('agent_clients').update({ withdrawn_at: new Date().toISOString(), can_view_documents: false }).eq('id', l.id))}>
                Withdraw consent
              </button>
            </>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <div className="min-w-[14rem] flex-1"><label className="label">Link an agent</label>
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose an agent…</option>
            {agents.filter((a) => !linkedIds.has(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.city ? `${a.city}, ` : ''}{a.country}</option>)}
          </select></div>
        <button className="btn-primary" disabled={!pick} onClick={linkAgent}>Give consent</button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  )
}

// A business names the chamber, export agency or association it belongs to; the partner confirms (user story P1)
function Memberships() {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const [partners, setPartners] = useState([])
  const [pick, setPick] = useState('')
  const [err, setErr] = useState(null)
  const load = () => supabase.from('partner_members').select('*, partner:organisations!partner_members_partner_org_id_fkey(id, name, country)')
    .eq('member_org_id', org.id).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('organisations').select('id, name, country').eq('role', 'partner').order('name').then(({ data }) => setPartners(data ?? []))
  }, [org.id]) // eslint-disable-line
  async function add() {
    setErr(null)
    const { error } = await supabase.from('partner_members').insert({ partner_org_id: pick, member_org_id: org.id })
    if (error) setErr(error.message); else { setPick(''); load() }
  }
  async function remove(id) { await supabase.from('partner_members').delete().eq('partner_org_id', id).eq('member_org_id', org.id); load() }
  const have = new Set(rows.map((r) => r.partner_org_id))
  return (
    <section className="card space-y-3">
      <div><h3 className="text-lg font-semibold">Associations and chambers</h3>
        <p className="text-sm text-navy/60">Name the support organisations you belong to. They confirm your membership and can then see your verification level.</p></div>
      {rows.map((r) => (
        <div key={r.partner_org_id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
          <span className="flex-1 font-medium">{r.partner?.name} <span className="text-xs font-normal text-navy/60">{r.partner?.country}</span></span>
          <span className={`text-xs ${r.confirmed ? 'text-leaf' : 'text-amber-700'}`}>{r.confirmed ? 'Confirmed' : 'Waiting for confirmation'}</span>
          <button className="text-navy/50 hover:underline" onClick={() => remove(r.partner_org_id)}>Remove</button>
        </div>))}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <div className="min-w-[14rem] flex-1"><label className="label">Add an association</label>
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>{partners.filter((p) => !have.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.country}</option>)}
          </select></div>
        <button className="btn-primary" disabled={!pick} onClick={add}>Add</button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  )
}
