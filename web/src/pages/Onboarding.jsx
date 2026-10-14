import { useEffect, useState } from 'react'
import { supabase, ROLE_LABEL } from '../supabase'
import { useAuth } from '../App'

export default function Onboarding() {
  const { refresh } = useAuth()
  const [countries, setCountries] = useState([])
  const [commodities, setCommodities] = useState([])
  const [f, setF] = useState({ name: '', role: 'exporter', country: 'KE', city: '', registration_no: '', year: '', description: '', hs: [], full_name: '', phone: '' })
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
    const { error } = await supabase.rpc('create_my_organisation', {
      p_name: f.name, p_role: f.role, p_country: f.country, p_city: f.city || null,
      p_registration_no: f.registration_no || null, p_year_established: f.year ? Number(f.year) : null,
      p_description: f.description || null, p_hs_codes: f.hs, p_full_name: f.full_name, p_phone: f.phone || null,
    })
    setBusy(false)
    if (error) setErr(error.message); else refresh()
  }

  const trader = ['exporter', 'importer'].includes(f.role)
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Set up your organisation</h1>
      <p className="mt-2 text-navy/60">Your profile starts as <b>self-declared</b>. Uploading documents and an OXL check raise your verification tier, which buyers and financiers see.</p>
      <form onSubmit={submit} className="card mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">I am a…</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <button type="button" key={k} onClick={() => setF({ ...f, role: k })}
                className={`rounded-lg border px-3 py-2 text-sm ${f.role === k ? 'border-navy bg-navy text-white' : 'border-line bg-white'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2"><label className="label">Organisation name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
        <div><label className="label">Country</label>
          <select className="input" value={f.country} onChange={set('country')}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}{c.is_pilot ? ' (pilot)' : ''}</option>)}
          </select>
        </div>
        <div><label className="label">City / town</label><input className="input" value={f.city} onChange={set('city')} /></div>
        <div><label className="label">Registration number</label><input className="input" value={f.registration_no} onChange={set('registration_no')} placeholder="e.g. BRS / ORC number" /></div>
        <div><label className="label">Year established</label><input className="input" type="number" min="1900" max="2100" value={f.year} onChange={set('year')} /></div>
        <div className="sm:col-span-2"><label className="label">What you do</label><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></div>
        {trader && (
          <div className="sm:col-span-2">
            <label className="label">Commodities you trade</label>
            <div className="flex flex-wrap gap-2">
              {commodities.map((c) => (
                <button type="button" key={c.hs_code} onClick={() => toggleHs(c.hs_code)}
                  className={`rounded-full border px-3 py-1 text-xs ${f.hs.includes(c.hs_code) ? 'border-leaf bg-leaf text-white' : 'border-line bg-white'}`}>
                  {c.name} <span className="opacity-60">HS {c.hs_code}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div><label className="label">Your name</label><input className="input" required value={f.full_name} onChange={set('full_name')} /></div>
        <div><label className="label">Phone / WhatsApp</label><input className="input" value={f.phone} onChange={set('phone')} placeholder="+254… / +233…" /></div>
        {err && <p className="sm:col-span-2 text-sm text-red-700">{err}</p>}
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create organisation'}</button></div>
      </form>
    </div>
  )
}
