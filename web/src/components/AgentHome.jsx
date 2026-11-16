// Agent dashboard: clients with their consent status, and a form to onboard a new client (user stories A2, A5)
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLE_LABEL, CONSENT_LABEL, ENTITY_LABEL } from '../supabase'
import { useAuth } from '../App'
import { DemoBadge, TierBadge } from './Badges'
import BusinessCategorySelect from './BusinessCategorySelect'

const EMPTY = { name: '', role: 'exporter', entity_type: 'individual', business_category_id: null, country: 'GH', city: '', registration_no: '', description: '', hs: [],
  contact_name: '', contact_phone: '', consent_method: 'signed_form', consent_note: '' }

export default function AgentHome() {
  const { org } = useAuth()
  const [clients, setClients] = useState([])
  const [profile, setProfile] = useState(null)
  const [docCount, setDocCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [deals, setDeals] = useState([])
  const [prospects, setProspects] = useState([])

  const load = () => {
    supabase.from('agent_clients')
      .select('*, client:organisations!agent_clients_client_org_id_fkey(id, name, role, country, city, verification_tier, is_demo)')
      .eq('agent_org_id', org.id).order('created_at', { ascending: false })
      .then(({ data }) => setClients(data ?? []))
  }
  useEffect(() => {
    load()
    supabase.from('agent_profiles').select('*').eq('org_id', org.id).maybeSingle().then(({ data }) => setProfile(data))
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', org.id).then(({ count }) => setDocCount(count ?? 0))
    supabase.from('interests').select('*, offers(org_id, organisations(name), commodities(name)), requests(org_id, organisations(name))')
      .eq('agent_org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setDeals(data ?? []))
    loadProspects()
  }, [org.id]) // eslint-disable-line

  const loadProspects = () => supabase.from('prospects').select('*').eq('assigned_agent_org_id', org.id).in('status', ['new', 'reviewed', 'invited'])
    .order('fit_score', { ascending: false }).then(({ data }) => setProspects(data ?? []))
  async function invite(p) {
    const link = `${window.location.origin}/invite/${p.invite_token}`
    const text = `Hello ${p.name},\n\nI am ${org.name}, an agent on OXL, a platform that connects verified African businesses, buyers and sellers, between Kenya, Ghana and other markets. I think OXL could help you find ${p.role === 'importer' ? 'verified suppliers' : 'verified buyers'}.\n\nJoin here, or ask OXL to delete your details: ${link}`
    try { await navigator.clipboard.writeText(text) } catch { window.prompt('Copy this invitation:', text) }
    await supabase.from('prospects').update({ status: 'invited', invited_at: new Date().toISOString() }).eq('id', p.id)
    loadProspects()
  }
  const active = clients.filter((c) => !c.withdrawn_at)
  const verified = active.filter((c) => c.client?.verification_tier !== 'self_declared')
  const reachedDelivery = deals.filter((d) => ['delivered', 'completed'].includes(d.status)).length

  return (
    <div className="space-y-8">
      {(docCount === 0 || org.verification_tier === 'self_declared') && (
        <div className="rounded-xl border border-terra/30 bg-terra/5 p-4 text-sm">
          <b>Get verified as an agent.</b> Upload your national ID or passport{profile?.code_of_conduct_signed_at ? '' : ' and signed code of conduct'}, and your broker licence if you have one.{' '}
          <Link to="/documents" className="font-medium text-terra underline">Upload documents →</Link>
        </div>
      )}

      {profile?.is_field_officer && (
        <div className="rounded-xl border border-navy/20 bg-navy p-4 text-sm text-white">
          <b>OXL field officer{profile.field_area ? ` · ${profile.field_area}` : ''}.</b> You onboard farmers yourself and lead a network of agents. Deals your agents introduce are credited to you too.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active clients" value={active.length} />
        <Stat label="Clients verified" value={verified.length} />
        <Stat label="Deals introduced" value={deals.length} />
        <Stat label="Reached delivery" value={deals.length ? `${reachedDelivery} (${Math.round((100 * reachedDelivery) / deals.length)}%)` : '—'} />
      </section>
      {profile?.areas_covered?.length > 0 && <p className="-mt-4 text-sm text-navy/60">Areas covered: {profile.areas_covered.join(', ')}</p>}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Your clients</h2>
            <p className="text-sm text-navy/60">Farmers, cooperatives and businesses you represent. You can act for them only while their consent is active.</p>
          </div>
          <button className="btn-primary" onClick={() => setOpen(!open)}>{open ? 'Close form' : '+ Onboard a client'}</button>
        </div>
        {open && <OnboardClient onDone={() => { setOpen(false); load() }} />}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {clients.length === 0 && <div className="card text-sm text-navy/60">No clients yet. Onboard your first farmer, cooperative or exporter, or ask an existing OXL business to link to you from its profile.</div>}
          {clients.map((c) => (
            <div key={c.id} className={`card ${c.withdrawn_at ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{c.client?.name}</div>
                  <div className="text-xs text-navy/60">{ROLE_LABEL[c.client?.role]} · {c.client?.city ? `${c.client.city}, ` : ''}{c.client?.country}</div>
                </div>
                <div className="flex shrink-0 gap-1.5"><TierBadge tier={c.client?.verification_tier} /><DemoBadge show={c.client?.is_demo} /></div>
              </div>
              <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 text-xs">
                <dt className="text-navy/50">Consent</dt>
                <dd>{c.withdrawn_at ? <span className="font-medium text-red-700">Withdrawn {new Date(c.withdrawn_at).toLocaleDateString()}</span> : <>{CONSENT_LABEL[c.consent_method]} · {new Date(c.consent_given_at).toLocaleDateString()}</>}</dd>
                <dt className="text-navy/50">Document access</dt>
                <dd>{c.can_view_documents ? 'Allowed by client' : 'Not allowed (upload only)'}</dd>
                {c.client_contact_name && <><dt className="text-navy/50">Contact</dt><dd>{c.client_contact_name}{c.client_contact_phone ? ` · ${c.client_contact_phone}` : ''}</dd></>}
              </dl>
              {!c.withdrawn_at && <Link to={`/clients/${c.client_org_id}`} className="mt-3 inline-block text-sm font-medium text-terra">Open client workspace →</Link>}
            </div>
          ))}
        </div>
      </section>

      {profile?.is_field_officer ? <OfficerNetwork /> : <MyFieldOfficer />}

      {prospects.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold">Prospects assigned to you</h2>
          <p className="text-sm text-navy/60">Businesses OXL found in public sources. Contact them with the invitation: they can join or ask to be deleted.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{prospects.map((p) => (
            <div key={p.id} className="card">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-navy/60">{p.role} · {p.city ? `${p.city}, ` : ''}{p.country} · fit {p.fit_score ?? '—'}/100{p.public_contact ? ` · ${p.public_contact}` : ''}</div>
              <button className="btn-primary mt-3" onClick={() => invite(p)}>{p.status === 'invited' ? 'Copy invitation again' : 'Copy invitation'}</button>
            </div>))}</div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-semibold">Deals you introduced</h2>
        <p className="text-sm text-navy/60">Your fee is shown to both sides on every deal. In the MVP, fees are paid between the parties outside OXL.</p>
        <div className="card mt-4 overflow-x-auto p-0">
          {deals.length === 0 ? <p className="p-5 text-sm text-navy/60">No deals yet. Open a client workspace, find matches and express interest for your client.</p> : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Seller → buyer</th><th>Commodity</th><th>Your fee</th><th>Status</th></tr></thead>
              <tbody>{deals.map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-4 py-2">{d.offers?.organisations?.name} → {d.requests?.organisations?.name}</td>
                  <td>{d.offers?.commodities?.name}</td><td className="text-xs">{d.agent_fee_note ?? '—'}</td>
                  <td className="capitalize">{String(d.status).replace('_', ' ')}</td>
                </tr>))}</tbody>
            </table>)}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, small }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-navy/50">{label}</div>
      <div className={`mt-1 font-semibold ${small ? 'text-sm' : 'text-2xl tabular-nums'}`}>{value}</div>
    </div>
  )
}

function OnboardClient({ onDone }) {
  const [f, setF] = useState(EMPTY)
  const [countries, setCountries] = useState([])
  const [commodities, setCommodities] = useState([])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  useEffect(() => {
    supabase.from('countries').select('*').order('is_pilot', { ascending: false }).order('name').then(({ data }) => setCountries(data ?? []))
    supabase.from('commodities').select('*').eq('is_active', true).order('name').then(({ data }) => setCommodities(data ?? []))
  }, [])
  const toggleHs = (code) => setF({ ...f, hs: f.hs.includes(code) ? f.hs.filter((c) => c !== code) : [...f.hs, code] })

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { data: newOrg, error } = await supabase.rpc('agent_create_client', {
      p_name: f.name, p_role: f.role, p_country: f.country, p_city: f.city || null, p_registration_no: f.registration_no || null,
      p_description: f.description || null, p_hs_codes: f.hs, p_contact_name: f.contact_name, p_contact_phone: f.contact_phone || null,
      p_consent_method: f.consent_method, p_consent_note: f.consent_note || null,
    })
    if (!error && newOrg) await supabase.rpc('agent_set_client_entity_type', { p_org: newOrg, p_entity_type: f.entity_type })
    if (!error && newOrg && f.business_category_id) await supabase.from('organisations').update({ business_category_id: f.business_category_id }).eq('id', newOrg)
    setBusy(false)
    if (error) setErr(error.message); else { setF(EMPTY); onDone() }
  }

  return (
    <form onSubmit={submit} className="card mt-4 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="text-lg font-semibold">Onboard a client</h3>
        <p className="text-xs text-navy/60">The client's profile starts as self-declared. You can then post listings and upload documents for them while their consent is active.</p></div>
      <div><label className="label">Client type</label>
        <select className="input" value={f.role} onChange={set('role')}><option value="exporter">Exporter / farmer group (sells)</option><option value="importer">Importer (buys)</option></select></div>
      <div><label className="label">Trades as</label>
        <select className="input" value={f.entity_type} onChange={set('entity_type')}>{Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label">Business, group or farmer name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
      <div><label className="label">Country</label>
        <select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
      <div><label className="label">Town / village</label><input className="input" value={f.city} onChange={set('city')} /></div>
      <div><label className="label">Registration number (if any)</label><input className="input" value={f.registration_no} onChange={set('registration_no')} /></div>
      <div><label className="label">Main business activity</label>
        <BusinessCategorySelect country={f.country} value={f.business_category_id} onChange={(v) => setF({ ...f, business_category_id: v })} /></div>
      <div className="sm:col-span-2"><label className="label">More about what they do</label><input className="input" value={f.description} onChange={set('description')} placeholder="e.g. 40-member cocoa cooperative" /></div>
      <div className="sm:col-span-2"><label className="label">Commodities</label>
        <div className="flex flex-wrap gap-2">{commodities.map((c) => (
          <button type="button" key={c.hs_code} onClick={() => toggleHs(c.hs_code)}
            className={`rounded-full border px-3 py-1 text-xs ${f.hs.includes(c.hs_code) ? 'border-leaf bg-leaf text-white' : 'border-line bg-white'}`}>{c.name}</button>))}</div></div>
      <div><label className="label">Contact person</label><input className="input" required value={f.contact_name} onChange={set('contact_name')} /></div>
      <div><label className="label">Contact phone</label><input className="input" value={f.contact_phone} onChange={set('contact_phone')} placeholder="+233… / +254…" /></div>
      <div><label className="label">How did the client give consent?</label>
        <select className="input" value={f.consent_method} onChange={set('consent_method')}>
          <option value="signed_form">Signed consent form</option><option value="recorded_verbal">Recorded verbal consent</option></select></div>
      <div><label className="label">Consent note</label><input className="input" value={f.consent_note} onChange={set('consent_note')} placeholder="e.g. Form signed at co-op meeting, 10 Nov" /></div>
      {err && <p className="sm:col-span-2 text-sm text-red-700">{err}</p>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Onboard client'}</button></div>
    </form>
  )
}

const VISIT_EMPTY = { visit_date: new Date().toISOString().slice(0, 10), outcome: 'confirmed', findings: '', location_text: '', lat: null, lon: null }

// Field officer: agents in the network (with their results), requests to join, and every client in the network
function OfficerNetwork() {
  const { org, profile: me } = useAuth()
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState([])
  const [allAgents, setAllAgents] = useState([])
  const [pick, setPick] = useState('')
  const [share, setShare] = useState('')
  const [visit, setVisit] = useState(null)   // client being visited
  const [v, setV] = useState(VISIT_EMPTY)
  const [msg, setMsg] = useState(null)
  const load = () => {
    supabase.rpc('my_network').then(({ data }) => setAgents(data ?? []))
    supabase.rpc('network_clients').then(({ data }) => setClients(data ?? []))
  }
  useEffect(() => {
    load()
    supabase.from('organisations').select('id, name, city, country').eq('role', 'agent').eq('is_suspended', false).neq('id', org.id).order('name')
      .then(({ data }) => setAllAgents(data ?? []))
  }, [org.id]) // eslint-disable-line
  async function run(p) { setMsg(null); const { error } = await p; if (error) setMsg({ err: error.message }); load() }
  async function saveVisit(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('field_visits').insert({ org_id: visit.client_org_id, visit_date: v.visit_date, outcome: v.outcome,
      findings: v.findings || null, location_text: v.location_text || null, lat: v.lat, lon: v.lon, visitor_name: me?.full_name ?? org.name, recorded_by: me?.id })
    if (error) setMsg({ err: error.message }); else { setMsg({ ok: `Visit to ${visit.client_name} recorded. OXL staff will review it and update the trust level.` }); setVisit(null); setV(VISIT_EMPTY); load() }
  }
  const inNetwork = new Set(agents.map((a) => a.agent_org_id))
  const activeAgents = agents.filter((a) => a.status === 'active')
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">My agent network</h2>
        <p className="text-sm text-navy/60">Agents who work with you to reach more farmers. You see their clients and results; each agent still acts for a client only with that client's consent.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Agents" value={activeAgents.length} />
        <Stat label="Clients in network" value={clients.length} />
        <Stat label="Open offers" value={activeAgents.reduce((n, a) => n + a.open_offers, 0)} />
        <Stat label="Deals completed" value={activeAgents.reduce((n, a) => n + a.deals_completed, 0)} />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Agent</th><th>Clients</th><th>Verified</th><th>Open offers</th><th>Deals</th><th>Your share</th><th></th></tr></thead>
          <tbody>
            {agents.length === 0 && <tr><td colSpan={7} className="px-4 py-4 text-navy/60">No agents yet. Invite one below, or agents can ask to join you.</td></tr>}
            {agents.map((a) => (
              <tr key={a.agent_org_id} className="border-t border-line">
                <td className="px-4 py-2"><b>{a.agent_name}</b> <span className="text-xs text-navy/50">{a.agent_city}</span>
                  {a.status === 'pending' && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{a.requested_by_me ? 'Invited' : 'Asks to join'}</span>}</td>
                <td className="tabular-nums">{a.clients}</td><td className="tabular-nums">{a.clients_verified}</td><td className="tabular-nums">{a.open_offers}</td>
                <td className="tabular-nums">{a.deals_completed}/{a.deals}</td><td className="text-xs">{a.officer_share_note ?? '—'}</td>
                <td className="space-x-2 whitespace-nowrap pr-4 text-right">
                  {a.status === 'pending' && !a.requested_by_me && <>
                    <button className="text-leaf" onClick={() => run(supabase.rpc('network_respond', { p_officer: org.id, p_agent: a.agent_org_id, p_accept: true }))}>Accept</button>
                    <button className="text-navy/50" onClick={() => run(supabase.rpc('network_respond', { p_officer: org.id, p_agent: a.agent_org_id, p_accept: false }))}>Decline</button></>}
                  <button className="text-navy/40" onClick={() => run(supabase.rpc('network_end', { p_officer: org.id, p_agent: a.agent_org_id }))}>{a.status === 'pending' ? 'Cancel' : 'Remove'}</button>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <div className="card flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1"><label className="label">Invite an agent to your network</label>
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose an agent…</option>
            {allAgents.filter((a) => !inNetwork.has(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.city ? `${a.city}, ` : ''}{a.country}</option>)}
          </select></div>
        <div className="min-w-[14rem] flex-1"><label className="label">Your share (shown on their deals)</label>
          <input className="input" value={share} onChange={(e) => setShare(e.target.value)} placeholder="e.g. 0.5% of deal value, from the agent fee" /></div>
        <button className="btn-primary" disabled={!pick} onClick={() => { run(supabase.rpc('network_request', { p_other: pick, p_share_note: share || null })); setPick(''); setShare('') }}>Send invitation</button>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Clients in your network</h3>
        <p className="text-sm text-navy/60">Record a field visit after you see a farm or store. OXL staff review visits before raising a trust level to Field verified.</p>
      </div>
      {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Client</th><th>Trades as</th><th>Trust level</th><th>Agent</th><th>Open offers</th><th>Last visit</th><th></th></tr></thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={7} className="px-4 py-4 text-navy/60">No clients yet.</td></tr>}
            {clients.map((c) => (
              <tr key={c.client_org_id} className="border-t border-line">
                <td className="px-4 py-2"><b>{c.client_name}</b> <span className="text-xs text-navy/50">{c.client_city ? `${c.client_city}, ` : ''}{c.client_country}</span></td>
                <td className="text-xs">{ENTITY_LABEL[c.entity_type] ?? '—'}</td><td><TierBadge tier={c.verification_tier} /></td>
                <td className="text-xs">{c.agent_org_id === org.id ? 'You' : c.agent_name}</td><td className="tabular-nums">{c.open_offers}</td>
                <td className="text-xs">{c.last_visit ? new Date(c.last_visit + 'T00:00:00').toLocaleDateString() : '—'}</td>
                <td className="pr-4 text-right"><button className="text-terra" onClick={() => { setVisit(c); setV(VISIT_EMPTY) }}>Record visit</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {visit && (
        <form onSubmit={saveVisit} className="card grid gap-3 sm:grid-cols-4">
          <h3 className="sm:col-span-4 text-lg font-semibold">Field visit: {visit.client_name}</h3>
          <div><label className="label">Visit date</label><input className="input" type="date" required value={v.visit_date} onChange={(e) => setV({ ...v, visit_date: e.target.value })} /></div>
          <div><label className="label">Outcome</label>
            <select className="input" value={v.outcome} onChange={(e) => setV({ ...v, outcome: e.target.value })}>
              <option value="confirmed">Confirmed</option><option value="concerns">Concerns found</option><option value="not_found">Business not found</option></select></div>
          <div className="sm:col-span-2"><label className="label">Place</label><input className="input" value={v.location_text} onChange={(e) => setV({ ...v, location_text: e.target.value })} placeholder="e.g. Store at Kenol market" /></div>
          <div className="sm:col-span-4 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="btn-ghost" onClick={() => navigator.geolocation?.getCurrentPosition(
              (p) => setV((cur) => ({ ...cur, lat: Number(p.coords.latitude.toFixed(6)), lon: Number(p.coords.longitude.toFixed(6)) })),
              () => setMsg({ err: 'Could not read your position. Allow location in the browser and try again.' }), { enableHighAccuracy: true, timeout: 15000 })}>
              Add my GPS position</button>
            <span className="text-xs text-navy/60">{v.lat != null ? `Recorded: ${v.lat}, ${v.lon}. OXL compares it with the business's pinned location.` : 'Record where you are standing, so OXL can compare it with the pinned location.'}</span>
          </div>
          <div className="sm:col-span-4"><label className="label">Findings</label><textarea className="input" rows={2} value={v.findings} onChange={(e) => setV({ ...v, findings: e.target.value })} placeholder="What you saw: stock, farm size, people met" /></div>
          <div className="sm:col-span-4 flex gap-2"><button className="btn-primary">Save visit</button><button type="button" className="btn-ghost" onClick={() => setVisit(null)}>Cancel</button></div>
        </form>
      )}
    </section>
  )
}

// Regular agent: work with an OXL field officer (one at a time), or leave
function MyFieldOfficer() {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const [officers, setOfficers] = useState([])
  const [pick, setPick] = useState('')
  const [err, setErr] = useState(null)
  const load = () => supabase.from('agent_networks').select('*, officer:organisations!agent_networks_officer_org_id_fkey(id, name, city)')
    .eq('agent_org_id', org.id).in('status', ['pending', 'active']).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('agent_profiles').select('org_id, field_area, organisations!inner(name, city, is_suspended)').eq('is_field_officer', true)
      .then(({ data }) => setOfficers((data ?? []).filter((o) => !o.organisations?.is_suspended)))
  }, [org.id]) // eslint-disable-line
  async function run(p) { setErr(null); const { error } = await p; if (error) setErr(error.message); load() }
  const current = rows[0]
  return (
    <section className="card space-y-3">
      <div><h3 className="text-lg font-semibold">OXL field officer</h3>
        <p className="text-sm text-navy/60">Work with an OXL field officer in your area to reach more farmers. The officer sees your clients and results, and is credited on the deals you introduce.</p></div>
      {current ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex-1"><b>{current.officer?.name}</b>{current.officer?.city ? ` · ${current.officer.city}` : ''}
            {current.officer_share_note && <span className="text-xs text-navy/60"> · officer share: {current.officer_share_note}</span>}</span>
          {current.status === 'pending' && current.requested_by !== org.id ? <>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Invites you</span>
            <button className="text-leaf" onClick={() => run(supabase.rpc('network_respond', { p_officer: current.officer_org_id, p_agent: org.id, p_accept: true }))}>Accept</button>
            <button className="text-navy/50" onClick={() => run(supabase.rpc('network_respond', { p_officer: current.officer_org_id, p_agent: org.id, p_accept: false }))}>Decline</button></>
            : <span className={`rounded-full px-2 py-0.5 text-xs ${current.status === 'active' ? 'bg-leaf/10 text-leaf' : 'bg-amber-100 text-amber-800'}`}>{current.status === 'active' ? 'Working together' : 'Waiting for the officer'}</span>}
          <button className="text-navy/40" onClick={() => run(supabase.rpc('network_end', { p_officer: current.officer_org_id, p_agent: org.id }))}>{current.status === 'active' ? 'Leave' : 'Cancel'}</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1"><label className="label">Ask to join a field officer</label>
            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {officers.map((o) => <option key={o.org_id} value={o.org_id}>{o.organisations?.name}{o.field_area ? ` · ${o.field_area}` : ''}</option>)}
            </select></div>
          <button className="btn-primary" disabled={!pick} onClick={() => run(supabase.rpc('network_request', { p_other: pick, p_share_note: null }))}>Send request</button>
        </div>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  )
}
