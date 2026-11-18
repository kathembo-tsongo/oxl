import { useEffect, useState } from 'react'
import { supabase, ROLE_LABEL, ENTITY_LABEL, ENTITY_HINT } from '../supabase'
import { useAuth } from '../App'
import { INVITE_KEY } from './Invite'
import BusinessCategorySelect from '../components/BusinessCategorySelect'
import CountrySelect from '../components/CountrySelect'
import TownInput from '../components/TownInput'
import YearSelect from '../components/YearSelect'
import CommodityPicker from '../components/CommodityPicker'
import PhoneInput from '../components/PhoneInput'
import TradeMap from '../components/TradeMap'
import Logo from '../components/Logo'

const ROLE_HINT = {
  exporter: 'You sell goods to buyers in other countries',
  importer: 'You buy goods from other countries',
  agent: 'You connect producers, sellers and buyers',
  financier: 'You lend to traders',
  partner: 'Chamber, export agency or association',
}
// Simple line icons (24x24)
const ROLE_ICON = {
  exporter: 'M5 12h14m-5-5 5 5-5 5',
  importer: 'M19 12H5m5-5-5 5 5 5',
  agent: 'M10 14a4 4 0 010-6l2-2a4 4 0 016 6l-1 1M14 10a4 4 0 010 6l-2 2a4 4 0 01-6-6l1-1',
  financier: 'M3 10l9-6 9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18',
  partner: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6',
}
const TIERS = ['Self-declared', 'Documents checked', 'Registry checked', 'Field verified']
const SHADES = ['#F4DDD2', '#E9B9A5', '#D98B6F', '#C2583A']

function Section({ id, n, done, title, hint, children }) {
  return (
    <section id={`sec-${id}`} className="card scroll-mt-24 !p-5 sm:!p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white transition-colors duration-300 ${done ? 'bg-leaf' : 'bg-navy'}`}>
          {done
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Done"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            : n}
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-navy/60">{hint}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
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
  const [tch, setTch] = useState({})
  const touch = (k) => setTch((p) => (p[k] ? p : { ...p, [k]: true }))
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    supabase.from('countries').select('*').order('is_pilot', { ascending: false }).order('name').then(({ data }) => setCountries((data ?? []).filter((c) => c.is_african)))
    supabase.from('commodities').select('*').eq('is_active', true).order('name').then(({ data }) => setCommodities(data ?? []))
  }, [])

  const agent = f.role === 'agent'
  const trader = ['exporter', 'importer', 'agent'].includes(f.role)
  const business = ['exporter', 'importer'].includes(f.role)

  // Progress: every field counts. Preselected defaults only count once the user has chosen them.
  const has = (v) => !!String(v ?? '').trim()
  const secs = [
    { key: 'who', label: 'Role', parts: [!!tch.role, ...(business ? [!!tch.entity] : [])] },
    { key: 'biz', label: 'Business', parts: [has(f.name), !!tch.country, has(f.city), has(f.registration_no), has(f.year), !!f.business_category_id, has(f.description)] },
    ...(trader ? [{ key: 'trade', label: 'Products', parts: [f.hs.length > 0] }] : []),
    ...(agent ? [{ key: 'agent', label: 'Agent profile', parts: [has(f.areas), has(f.references), has(f.endorsing_body), has(f.fee_note), f.conduct] }] : []),
    { key: 'you', label: 'About you', parts: [has(f.full_name), has(f.phone)] },
  ]
  const frac = (s) => s.parts.filter(Boolean).length / s.parts.length
  const secPct = (s) => Math.round(frac(s) * 100)
  const num = (k) => secs.findIndex((s) => s.key === k) + 1
  const isDone = (k) => frac(secs.find((s) => s.key === k)) === 1
  const doneCount = secs.filter((s) => frac(s) === 1).length
  const total = secs.reduce((a, s) => a + s.parts.length, 0)
  const filled = secs.reduce((a, s) => a + s.parts.filter(Boolean).length, 0)
  const pct = Math.round((filled / total) * 100)
  const missing = [!has(f.name) && 'organisation name', !f.business_category_id && 'main business activity', agent && !has(f.areas) && 'areas you cover', agent && !f.conduct && 'the code of conduct', !has(f.full_name) && 'your name'].filter(Boolean)

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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      {/* Welcome banner */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-[#17233f] to-[#0c1426] p-6 text-white sm:p-8">
        <TradeMap className="pointer-events-none absolute -right-8 -top-8 h-72 opacity-30 sm:h-96" />
        <button type="button" onClick={() => supabase.auth.signOut()} className="absolute right-4 top-4 z-10 rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/25 hover:bg-white/10 hover:text-white">Sign out</button>
        <div className="relative max-w-lg">
          <Logo size={28} variant="dark" />
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">Set up your profile</h1>
          <p className="mt-2 text-white/70">It takes about two minutes. You start as <b className="text-white">self-declared</b>. Uploading documents and an OXL check raise your trust level, which other users see.</p>
          <ol className="mt-5 flex flex-wrap gap-2" aria-label="Trust levels">
            {TIERS.map((t, i) => (
              <li key={t} className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/15">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SHADES[i] }} />
                {t}{i === 0 && <span className="text-white/60"> · you start here</span>}
              </li>
            ))}
          </ol>
        </div>
      </header>

      {/* Progress: fills as each section is completed */}
      <nav aria-label="Progress" className="sticky top-0 z-20 -mx-4 mt-4 bg-cream/90 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{filled} of {total} fields · {doneCount}/{secs.length} sections</span>
          <span className="tabular-nums text-navy/60">{pct}%</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {secs.map((s) => (
            <a key={s.key} href={`#sec-${s.key}`} className="group min-w-0 flex-1" title={s.label}>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-leaf transition-all duration-500" style={{ width: `${frac(s) * 100}%` }} />
              </div>
              <span className={`mt-1 hidden truncate text-[11px] sm:block ${frac(s) === 1 ? 'font-medium text-leaf' : 'text-navy/50'}`}>{s.label} {secPct(s)}%</span>
            </a>
          ))}
        </div>
      </nav>

      <form onSubmit={submit} className="mt-3 space-y-5">
        <Section id="who" n={num('who')} done={isDone('who')} title="Who are you?" hint="Choose the role that fits you best.">
          <div className="sm:col-span-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <button type="button" key={k} onClick={() => { touch('role'); setF({ ...f, role: k }) }} aria-pressed={f.role === k}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${f.role === k ? 'border-navy bg-navy text-white shadow-sm' : 'border-line bg-white hover:border-navy/40'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${f.role === k ? 'bg-white/15' : 'bg-cream'}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={f.role === k ? '#fff' : '#C2583A'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ROLE_ICON[k]} /></svg>
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{v}</span>
                    <span className={`block text-xs ${f.role === k ? 'text-white/70' : 'text-navy/50'}`}>{ROLE_HINT[k]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {business && (
            <div className="sm:col-span-2">
              <label className="label">I {f.role === 'exporter' ? 'sell' : 'buy'} as…</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(ENTITY_LABEL).map(([k, v]) => (
                  <button type="button" key={k} onClick={() => { touch('entity'); setF({ ...f, entity_type: k }) }} aria-pressed={f.entity_type === k}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${f.entity_type === k ? 'border-terra bg-terra/10' : 'border-line bg-white hover:border-navy/40'}`}>
                    <span className="block font-medium">{v}</span>
                    <span className="block text-xs text-navy/50">{ENTITY_HINT[k]}</span>
                  </button>
                ))}
              </div>
              {f.entity_type === 'trader' && <p className="mt-2 text-xs text-navy/60">You can list the producers you sell for on your Profile page. Each offer then shows whose goods they are and your commission.</p>}
            </div>
          )}
        </Section>

        <Section id="biz" n={num('biz')} done={isDone('biz')} title={agent ? 'Your agent business' : 'Your business'} hint="Tell us where you are and what you do.">
          <div className="sm:col-span-2"><label className="label">{agent ? 'Agent or business name' : f.entity_type === 'individual' && business ? 'Your trading name (or your full name)' : 'Organisation name'}</label><input className="input" required value={f.name} onChange={set('name')} /></div>
          <div><label className="label">Country</label>
            <CountrySelect value={f.country} countries={countries} onChange={(code) => { touch('country'); setF({ ...f, country: code, city: '', business_category_id: null }) }} />
          </div>
          <div><label className="label" htmlFor="town">City / town</label><TownInput id="town" country={f.country} value={f.city} onChange={(v) => setF((p) => ({ ...p, city: v }))} /></div>
          <div><label className="label">{agent ? 'Business registration or broker licence no. (if any)' : f.entity_type === 'individual' ? 'Registration number (if any)' : f.entity_type === 'trader' ? 'Registration or broker licence no.' : 'Registration number'}</label><input className="input" value={f.registration_no} onChange={set('registration_no')} placeholder="e.g. BRS / ORC number" /></div>
          <div><label className="label">{agent ? 'Year you started as an agent' : 'Year established'}</label><YearSelect value={f.year} onChange={(v) => setF((p) => ({ ...p, year: v }))} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="activity">Main business activity</label>
            <BusinessCategorySelect id="activity" country={f.country} required value={f.business_category_id} onChange={(v) => setF((p) => ({ ...p, business_category_id: v }))} /></div>
          <div className="sm:col-span-2"><label className="label">{agent ? 'Your services (optional)' : 'More about what you do (optional)'}</label><textarea className="input" rows={2} value={f.description} onChange={set('description')} /></div>
        </Section>

        {trader && (
          <Section id="trade" n={num('trade')} done={isDone('trade')} title={agent ? 'Commodities you work with' : 'Commodities you trade'} hint="Tick only what you actually deal in. You can change this later.">
            <div className="sm:col-span-2"><CommodityPicker commodities={commodities} value={f.hs} onChange={(hs) => setF((p) => ({ ...p, hs }))} /></div>
          </Section>
        )}

        {agent && (
          <Section id="agent" n={num('agent')} done={isDone('agent')} title="Your agent profile" hint="Clients see this before they accept you.">
            <div className="sm:col-span-2"><label className="label">Areas you cover (counties or regions, separated by commas)</label>
              <input className="input" required value={f.areas} onChange={set('areas')} placeholder="e.g. Ashanti, Bono, Ahafo" /></div>
            <div className="sm:col-span-2"><label className="label">Two references (name and phone)</label>
              <textarea className="input" rows={2} value={f.references} onChange={set('references')} placeholder="e.g. Kwame Asante, Offinso Cocoa Co-op, +233…" /></div>
            <div><label className="label">Endorsed by (optional)</label><input className="input" value={f.endorsing_body} onChange={set('endorsing_body')} placeholder="Cooperative, association or chamber" /></div>
            <div><label className="label">Your usual fee</label><input className="input" value={f.fee_note} onChange={set('fee_note')} placeholder="e.g. 2% of deal value, paid by seller" /></div>
            <div className="sm:col-span-2 rounded-xl border border-line bg-cream p-4 text-sm">
              <p className="font-medium">OXL agent code of conduct</p>
              <ul className="mt-1 list-disc pl-5 text-navy/70">
                <li>I will act for a client only with their consent, and stop when they withdraw it.</li>
                <li>I will show my fee to both sides of every deal I introduce.</li>
                <li>I will not represent both buyer and seller in one deal without telling both.</li>
                <li>I will give true information. OXL may suspend agents who mislead users.</li>
              </ul>
              <label className="mt-3 flex items-center gap-2 font-medium"><input type="checkbox" checked={f.conduct} onChange={(e) => setF({ ...f, conduct: e.target.checked })} /> I accept the code of conduct</label>
            </div>
          </Section>
        )}

        <Section id="you" n={num('you')} done={isDone('you')} title="About you" hint="So partners and OXL staff know who to contact.">
          <div><label className="label">Your name</label><input className="input" required value={f.full_name} onChange={set('full_name')} /></div>
          <div><label className="label">Phone / WhatsApp</label><PhoneInput country={f.country} countries={countries} value={f.phone} onChange={(v) => setF((p) => ({ ...p, phone: v }))} /></div>
        </Section>

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="card flex flex-wrap items-center gap-4 !p-5">
          {missing.length > 0 && <p className="w-full text-xs text-terra">Still needed: {missing.join(', ')}.</p>}
          <button className="btn-primary px-6 py-2.5" disabled={busy}>{busy ? 'Saving…' : agent ? 'Register as an agent' : 'Create profile'}</button>
          <p className="min-w-[14rem] flex-1 text-xs text-navy/60">Next, on your <b>Profile</b> page: upload {agent || (business && ['individual', 'trader'].includes(f.entity_type)) ? 'your national ID or passport' : 'the national ID or passport of two directors or representatives'}, and pin your business location on the map. OXL checks both before raising your trust level.</p>
        </div>
      </form>
    </div>
  )
}
