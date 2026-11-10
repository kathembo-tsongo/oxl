// Agent dashboard: clients with their consent status, and a form to onboard a new client (user stories A2, A5)
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLE_LABEL, CONSENT_LABEL } from '../supabase'
import { useAuth } from '../App'
import { DemoBadge, TierBadge } from './Badges'

const EMPTY = { name: '', role: 'exporter', country: 'GH', city: '', registration_no: '', description: '', hs: [],
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
    const text = `Hello ${p.name},\n\nI am ${org.name}, an agent on OXL, a platform that connects verified agribusiness buyers and sellers between Kenya, Ghana and other markets. I think OXL could help you find ${p.role === 'importer' ? 'verified suppliers' : 'verified buyers'}.\n\nJoin here, or ask OXL to delete your details: ${link}`
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
    supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? []))
  }, [])
  const toggleHs = (code) => setF({ ...f, hs: f.hs.includes(code) ? f.hs.filter((c) => c !== code) : [...f.hs, code] })

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.rpc('agent_create_client', {
      p_name: f.name, p_role: f.role, p_country: f.country, p_city: f.city || null, p_registration_no: f.registration_no || null,
      p_description: f.description || null, p_hs_codes: f.hs, p_contact_name: f.contact_name, p_contact_phone: f.contact_phone || null,
      p_consent_method: f.consent_method, p_consent_note: f.consent_note || null,
    })
    setBusy(false)
    if (error) setErr(error.message); else { setF(EMPTY); onDone() }
  }

  return (
    <form onSubmit={submit} className="card mt-4 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="text-lg font-semibold">Onboard a client</h3>
        <p className="text-xs text-navy/60">The client's profile starts as self-declared. You can then post listings and upload documents for them while their consent is active.</p></div>
      <div><label className="label">Client type</label>
        <select className="input" value={f.role} onChange={set('role')}><option value="exporter">Exporter / farmer group (sells)</option><option value="importer">Importer (buys)</option></select></div>
      <div><label className="label">Business or group name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
      <div><label className="label">Country</label>
        <select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
      <div><label className="label">Town / village</label><input className="input" value={f.city} onChange={set('city')} /></div>
      <div><label className="label">Registration number (if any)</label><input className="input" value={f.registration_no} onChange={set('registration_no')} /></div>
      <div><label className="label">What they do</label><input className="input" value={f.description} onChange={set('description')} placeholder="e.g. 40-member cocoa cooperative" /></div>
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
