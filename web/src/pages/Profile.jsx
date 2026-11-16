// Profile: edit organisation details; agents edit their agent profile;
// traders link agents and control consent and document access (user stories S1, S7, A1)
import { useEffect, useState } from 'react'
import { supabase, ROLE_LABEL, CONSENT_LABEL, ENTITY_LABEL, ENTITY_HINT } from '../supabase'
import { useAuth } from '../App'
import { TierBadge } from '../components/Badges'
import BusinessCategorySelect from '../components/BusinessCategorySelect'
import IdentityCard from '../components/IdentityCard'
import LocationCard from '../components/LocationCard'
import { SecurityCard } from '../components/Security'

export default function Profile() {
  const { org, refresh } = useAuth()
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">{org.name}</h2>
        <TierBadge tier={org.verification_tier} />
        <span className="text-sm text-navy/60">{ROLE_LABEL[org.role]}{org.entity_type ? ` · ${ENTITY_LABEL[org.entity_type]}` : ''}</span>
      </div>
      <OrgDetails />
      <IdentityCard org={org} />
      <LocationCard org={org} onSaved={refresh} />
      {org.role === 'agent' && <AgentDetails />}
      {org.role === 'exporter' && ['trader', 'cooperative'].includes(org.entity_type) && <MyProducers />}
      {org.role === 'exporter' && ['individual', 'enterprise', 'cooperative'].includes(org.entity_type) && <SellersOfMyGoods />}
      {['exporter', 'importer'].includes(org.role) && <MyAgents />}
      {['exporter', 'importer', 'agent'].includes(org.role) && <Memberships />}
      <SecurityCard />
    </div>
  )
}

function OrgDetails() {
  const { org, refresh } = useAuth()
  const [commodities, setCommodities] = useState([])
  const [f, setF] = useState({ name: org.name, city: org.city ?? '', registration_no: org.registration_no ?? '',
    year_established: org.year_established ?? '', description: org.description ?? '', hs_codes: org.hs_codes ?? [],
    entity_type: org.entity_type ?? '', business_category_id: org.business_category_id ?? null })
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  useEffect(() => { supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? [])) }, [])
  const toggleHs = (c) => setF({ ...f, hs_codes: f.hs_codes.includes(c) ? f.hs_codes.filter((x) => x !== c) : [...f.hs_codes, c] })

  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('organisations').update({
      name: f.name, city: f.city || null, registration_no: f.registration_no || null,
      year_established: f.year_established ? Number(f.year_established) : null, description: f.description || null, hs_codes: f.hs_codes,
      business_category_id: f.business_category_id,
      ...(['exporter', 'importer'].includes(org.role) ? { entity_type: f.entity_type || null } : {}),
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
      {['exporter', 'importer'].includes(org.role) && (
        <div className="sm:col-span-2"><label className="label">I {org.role === 'exporter' ? 'sell' : 'buy'} as</label>
          <select className="input" value={f.entity_type} onChange={set('entity_type')}>
            <option value="">Choose…</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}: {ENTITY_HINT[k]}</option>)}
          </select></div>
      )}
      <div className="sm:col-span-2"><label className="label" htmlFor="activity">Main business activity</label>
        <BusinessCategorySelect id="activity" country={org.country} value={f.business_category_id} onChange={(v) => setF({ ...f, business_category_id: v })} /></div>
      <div className="sm:col-span-2"><label className="label">More about what you do</label><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></div>
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

// A trader or cooperative records the producers whose goods it sells (Richmond, 11 Nov 2026).
// Producers on OXL authorise the trader themselves (SellersOfMyGoods); producers not on OXL are
// recorded here with how they gave consent and the agreed commission.
const NO_PRODUCER = { producer_name: '', producer_phone: '', producer_town: '', consent_method: 'signed_form', consent_note: '', commission_pct: '' }
function MyProducers() {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const [f, setF] = useState(NO_PRODUCER)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState(null)
  const load = () => supabase.from('seller_producers')
    .select('*, producer:organisations!seller_producers_producer_org_id_fkey(id, name, city, country, verification_tier)')
    .eq('seller_org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [org.id]) // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function add(e) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.from('seller_producers').insert({
      seller_org_id: org.id, producer_name: f.producer_name, producer_phone: f.producer_phone || null, producer_town: f.producer_town || null,
      consent_method: f.consent_method, consent_note: f.consent_note || null, commission_pct: f.commission_pct === '' ? null : Number(f.commission_pct),
    })
    if (error) setErr(error.message); else { setF(NO_PRODUCER); setOpen(false); load() }
  }
  async function stop(id) { setErr(null); const { error } = await supabase.from('seller_producers').update({ withdrawn_at: new Date().toISOString() }).eq('id', id); if (error) setErr(error.message); load() }
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold">{org.entity_type === 'cooperative' ? 'Members whose produce we sell' : 'Producers I sell for'}</h3>
          <p className="text-sm text-navy/60">When you post an offer you choose whose goods they are. Buyers and lenders see the owner and your commission. Producers on OXL add you from their own Profile page.</p></div>
        <button className="btn-primary" onClick={() => setOpen(!open)}>{open ? 'Cancel' : '+ Add a producer not on OXL'}</button>
      </div>
      {open && (
        <form onSubmit={add} className="grid gap-3 rounded-lg bg-cream p-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><label className="label">Producer or farm name</label><input className="input" required value={f.producer_name} onChange={set('producer_name')} placeholder="e.g. Mama Njeri, 2 acres Hass avocado" /></div>
          <div><label className="label">Town / village</label><input className="input" value={f.producer_town} onChange={set('producer_town')} /></div>
          <div><label className="label">Phone</label><input className="input" value={f.producer_phone} onChange={set('producer_phone')} placeholder="+254… / +233…" /></div>
          <div><label className="label">How did they give consent?</label>
            <select className="input" value={f.consent_method} onChange={set('consent_method')}><option value="signed_form">{CONSENT_LABEL.signed_form}</option><option value="recorded_verbal">{CONSENT_LABEL.recorded_verbal}</option></select></div>
          <div><label className="label">Commission (%)</label><input className="input" type="number" step="0.1" min="0" max="50" value={f.commission_pct} onChange={set('commission_pct')} placeholder="e.g. 5" /></div>
          <div className="sm:col-span-3"><label className="label">Consent note</label><input className="input" value={f.consent_note} onChange={set('consent_note')} placeholder="e.g. Agreement signed at the farm, 10 Nov" /></div>
          <div className="sm:col-span-3"><button className="btn-primary">Save producer</button></div>
        </form>
      )}
      {rows.length === 0 && <p className="text-sm text-navy/60">No producers yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.producer?.name ?? r.producer_name} {r.producer ? <TierBadge tier={r.producer.verification_tier} /> : <span className="text-xs font-normal text-navy/50">not on OXL</span>}</div>
            <div className="text-xs text-navy/60">{[r.producer?.city ?? r.producer_town, r.producer_phone].filter(Boolean).join(' · ')}{r.producer || r.producer_town || r.producer_phone ? ' · ' : ''}
              {CONSENT_LABEL[r.consent_method]} · commission {r.commission_pct != null ? `${Number(r.commission_pct)}%` : 'not set'}
              {r.withdrawn_at && <span className="ml-1 font-medium text-red-700">· ended {new Date(r.withdrawn_at).toLocaleDateString()}</span>}</div>
          </div>
          {!r.withdrawn_at && <button className="btn-ghost text-red-700" onClick={() => stop(r.id)}>Stop selling for them</button>}
        </div>
      ))}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  )
}

// A producer on OXL authorises a trader or cooperative to sell its goods, and can withdraw at any time
function SellersOfMyGoods() {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const [sellers, setSellers] = useState([])
  const [pick, setPick] = useState('')
  const [pct, setPct] = useState('')
  const [err, setErr] = useState(null)
  const load = () => supabase.from('seller_producers')
    .select('*, seller:organisations!seller_producers_seller_org_id_fkey(id, name, city, country, entity_type, verification_tier)')
    .eq('producer_org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('organisations').select('id, name, city, country, entity_type').eq('role', 'exporter').in('entity_type', ['trader', 'cooperative'])
      .eq('is_suspended', false).neq('id', org.id).order('name').then(({ data }) => setSellers(data ?? []))
  }, [org.id]) // eslint-disable-line
  async function add() {
    setErr(null)
    const { error } = await supabase.from('seller_producers').insert({ seller_org_id: pick, producer_org_id: org.id, consent_method: 'in_app', commission_pct: pct === '' ? null : Number(pct) })
    if (error) setErr(error.message); else { setPick(''); setPct(''); load() }
  }
  async function withdraw(id) { setErr(null); const { error } = await supabase.from('seller_producers').update({ withdrawn_at: new Date().toISOString() }).eq('id', id); if (error) setErr(error.message); load() }
  const active = new Set(rows.filter((r) => !r.withdrawn_at).map((r) => r.seller_org_id))
  return (
    <section className="card space-y-4">
      <div><h3 className="text-lg font-semibold">Traders who sell my goods</h3>
        <p className="text-sm text-navy/60">Allow a trader or cooperative to post offers of your produce in its own name, for an agreed commission. If you withdraw, its open offers of your goods close at once.</p></div>
      {rows.length === 0 && <p className="text-sm text-navy/60">No traders authorised.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.seller?.name} <TierBadge tier={r.seller?.verification_tier} /> <span className="text-xs font-normal text-navy/50">{ENTITY_LABEL[r.seller?.entity_type]}</span></div>
            <div className="text-xs text-navy/60">Since {new Date(r.created_at).toLocaleDateString()} · commission {r.commission_pct != null ? `${Number(r.commission_pct)}%` : 'not set'}
              {r.withdrawn_at && <span className="ml-1 font-medium text-red-700">· withdrawn {new Date(r.withdrawn_at).toLocaleDateString()}</span>}</div>
          </div>
          {!r.withdrawn_at && <button className="btn-ghost text-red-700" onClick={() => withdraw(r.id)}>Withdraw consent</button>}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <div className="min-w-[14rem] flex-1"><label className="label">Authorise a trader or cooperative</label>
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>
            {sellers.filter((x) => !active.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name} · {ENTITY_LABEL[x.entity_type]} · {x.city ? `${x.city}, ` : ''}{x.country}</option>)}
          </select></div>
        <div className="w-32"><label className="label">Commission (%)</label><input className="input" type="number" step="0.1" min="0" max="50" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
        <button className="btn-primary" disabled={!pick} onClick={add}>Give consent</button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  )
}
