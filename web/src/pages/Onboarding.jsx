import { useEffect, useState } from 'react'
import { supabase, ROLE_LABEL, ENTITY_LABEL, ENTITY_HINT } from '../supabase'
import { useAuth } from '../App'
import { INVITE_KEY } from './Invite'
import BusinessCategorySelect from '../components/BusinessCategorySelect'
import YearSelect from '../components/YearSelect'
import CountrySelect from '../components/CountrySelect'
import TownInput from '../components/TownInput'
import CommodityPicker from '../components/CommodityPicker'
import PhoneInput from '../components/PhoneInput'

const ROLE_HINT = {
  exporter: 'You sell goods to buyers in other countries',
  importer: 'You buy goods from other countries',
  agent: 'You connect producers, sellers and buyers',
  financier: 'You lend to traders',
  partner: 'Chamber, export agency or association',
}

export default function Onboarding() {
  const { refresh } = useAuth()
  const [countries, setCountries] = useState([])
  const [commodities, setCommodities] = useState([])
  const [f, setF] = useState({
    name: '', role: 'exporter', entity_type: 'enterprise', country: 'KE', city: '', registration_no: '', year: '', description: '', business_category_id: null, hs: [], full_name: '', phone: '',
    areas: '', references: '', endorsing_body: '', fee_note: '', conduct: false,
  })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    supabase.from('countries').select('*').order('is_pilot', { ascending: false }).order('name').then(({ data }) => setCountries((data ?? []).filter((c) => c.is_african)))
    supabase.from('commodities').select('*').eq('is_active', true).order('name').then(({ data }) => setCommodities(data ?? []))
  }, [])

  const toggleHs = (code) => setF({ ...f, hs: f.hs.includes(code) ? f.hs.filter((c) => c !== code) : [...f.hs, code] })
  const agent = f.role === 'agent'
  const trader = ['exporter', 'importer', 'agent'].includes(f.role)
  const business = ['exporter', 'importer'].includes(f.role)

  async function submit(e) {
    e.preventDefault(); setErr(null)
    if (agent && !f.conduct) { setErr('Please accept the OXL agent code of conduct to register as an agent.'); return }
    setBusy(true)
    const { data: orgId, error } = await supabase.rpc('create_my_organisation', {
      p_name: f.name, p_role: f.role, p_country: f.country, p_city: f.city || null,
      p_registration_no: f.registration_no || null, p_year_established: f.year ? Number(f.year) : null,
      p_description: f.description || null, p_hs_codes: f.hs, p_full_name: f.full_name, p_phone: f.phone || null,
    })
    if (!error) {
      const { error: eErr } = await supabase.from('organisations')
        .update({ business_category_id: f.business_category_id, ...(business ? { entity_type: f.entity_type } : {}) }).eq('id', orgId)
      if (eErr) { setBusy(false); setErr(eErr.message); return }
    }
    if (!error && agent) {
      const { error: aErr } = await supabase.from('agent_profiles').insert({
        org_id: orgId,
        areas_covered: f.areas.split(',').map((a) => a.trim()).filter(Boolean),
        references_text: f.references || null,
        endorsing_body: f.endorsing_body || null,
        typical_fee_note: f.fee_note || null,
        code_of_conduct_signed_at: new Date().toISOString(),
      })
      if (aErr) { setBusy(false); setErr(aErr.message); return }
    }
    if (!error) {
      // Joined through an invitation link: mark the prospect as claimed
      let token = null
      try { token = localStorage.getItem(INVITE_KEY) } catch { /* ignore */ }
      if (token) { await supabase.rpc('claim_prospect', { p_token: token }); try { localStorage.removeItem(INVITE_KEY) } catch { /* ignore */ } }
    }
    setBusy(false)
    if (error) setErr(error.message); else refresh()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Set up your profile</h1>
      <p className="mt-2 text-navy/60">Your profile starts as <b>self-declared</b>. Uploading documents and an OXL check raise your verification level, which other users see.</p>
      <form onSubmit={submit} className="card mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">I am…</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <button type="button" key={k} onClick={() => setF({ ...f, role: k })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${f.role === k ? 'border-navy bg-navy text-white' : 'border-line bg-white'}`}>
                <span className="block font-medium">{v}</span>
                <span className={`block text-xs ${f.role === k ? 'text-white/70' : 'text-navy/50'}`}>{ROLE_HINT[k]}</span>
              </button>
            ))}
          </div>
        </div>
        {business && (
          <div className="sm:col-span-2">
            <label className="label">I {f.role === 'exporter' ? 'sell' : 'buy'} as…</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(ENTITY_LABEL).map(([k, v]) => (
                <button type="button" key={k} onClick={() => setF({ ...f, entity_type: k })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${f.entity_type === k ? 'border-terra bg-terra/10' : 'border-line bg-white'}`}>
                  <span className="block font-medium">{v}</span>
                  <span className="block text-xs text-navy/50">{ENTITY_HINT[k]}</span>
                </button>
              ))}
            </div>
            {f.entity_type === 'trader' && <p className="mt-2 text-xs text-navy/60">You can list the producers you sell for on your Profile page. Each offer then shows whose goods they are and your commission.</p>}
          </div>
        )}
        <div className="sm:col-span-2"><label className="label">{agent ? 'Agent or business name' : f.entity_type === 'individual' && business ? 'Your trading name (or your full name)' : 'Organisation name'}</label><input className="input" required value={f.name} onChange={set('name')} /></div>
        <div><label className="label">Country</label>
          <CountrySelect value={f.country} countries={countries} onChange={(code) => setF({ ...f, country: code, city: '', business_category_id: null })} />
        </div>
        <div><label className="label" htmlFor="town">City / town</label><TownInput id="town" country={f.country} value={f.city} onChange={(v) => setF((p) => ({ ...p, city: v }))} /></div>
        <div><label className="label">{agent ? 'Business registration or broker licence no. (if any)' : f.entity_type === 'individual' ? 'Registration number (if any)' : f.entity_type === 'trader' ? 'Registration or broker licence no.' : 'Registration number'}</label><input className="input" value={f.registration_no} onChange={set('registration_no')} placeholder="e.g. BRS / ORC number" /></div>
        <div><label className="label">{agent ? 'Year you started as an agent' : 'Year established'}</label><YearSelect value={f.year} onChange={(v) => setF({ ...f, year: v })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="activity">Main business activity</label>
          <BusinessCategorySelect id="activity" country={f.country} required value={f.business_category_id} onChange={(v) => setF({ ...f, business_category_id: v })} /></div>
        <div className="sm:col-span-2"><label className="label">{agent ? 'Your services (optional)' : 'More about what you do (optional)'}</label><textarea className="input" rows={2} value={f.description} onChange={set('description')} /></div>
        {trader && (
          <div className="sm:col-span-2">
            <label className="label">{agent ? 'Commodities you work with' : 'Commodities you trade'}</label>
            <CommodityPicker commodities={commodities} value={f.hs} onChange={(hs) => setF({ ...f, hs })} />
          </div>
        )}
        {agent && (
          <>
            <div className="sm:col-span-2"><label className="label">Areas you cover (counties or regions, separated by commas)</label>
              <input className="input" required value={f.areas} onChange={set('areas')} placeholder="e.g. Ashanti, Bono, Ahafo" /></div>
            <div className="sm:col-span-2"><label className="label">Two references (name and phone)</label>
              <textarea className="input" rows={2} value={f.references} onChange={set('references')} placeholder="e.g. Kwame Asante, Offinso Cocoa Co-op, +233…" /></div>
            <div><label className="label">Endorsed by (optional)</label><input className="input" value={f.endorsing_body} onChange={set('endorsing_body')} placeholder="Cooperative, association or chamber" /></div>
            <div><label className="label">Your usual fee</label><input className="input" value={f.fee_note} onChange={set('fee_note')} placeholder="e.g. 2% of deal value, paid by seller" /></div>
            <div className="sm:col-span-2 rounded-lg border border-line bg-cream p-3 text-sm">
              <p className="font-medium">OXL agent code of conduct</p>
              <ul className="mt-1 list-disc pl-5 text-navy/70">
                <li>I will act for a client only with their consent, and stop when they withdraw it.</li>
                <li>I will show my fee to both sides of every deal I introduce.</li>
                <li>I will not represent both buyer and seller in one deal without telling both.</li>
                <li>I will give true information. OXL may suspend agents who mislead users.</li>
              </ul>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={f.conduct} onChange={(e) => setF({ ...f, conduct: e.target.checked })} /> I accept the code of conduct</label>
            </div>
          </>
        )}
        <div><label className="label">Your name</label><input className="input" required value={f.full_name} onChange={set('full_name')} /></div>
        <div><label className="label">Phone / WhatsApp</label><PhoneInput country={f.country} countries={countries} value={f.phone} onChange={(v) => setF((p) => ({ ...p, phone: v }))} /></div>
        {err && <p className="sm:col-span-2 text-sm text-red-700">{err}</p>}
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : agent ? 'Register as an agent' : 'Create profile'}</button></div>
        <p className="sm:col-span-2 text-xs text-navy/60">Next, on your <b>Profile</b> page: upload {agent || (business && ['individual', 'trader'].includes(f.entity_type)) ? 'your national ID or passport' : 'the national ID or passport of two directors or representatives'}, and pin your business location on the map. OXL checks both before raising your trust level.</p>
      </form>
    </div>
  )
}
