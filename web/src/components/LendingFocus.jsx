import { useEffect, useState } from 'react'
import { supabase, FINANCE_TYPE_LABEL } from '../supabase'
import { useAuth } from '../App'
import CommodityPicker from './CommodityPicker'

// A lender says what it finances. Empty means "everything"; requests that fit are shown first.
export default function LendingFocus() {
  const { org, refresh } = useAuth()
  const [commodities, setCommodities] = useState([])
  const [countries, setCountries] = useState([])
  const [f, setF] = useState({
    types: org.lending_types ?? [], hs: org.lending_hs_codes ?? [], countries: org.lending_countries ?? [],
    min: org.lending_min_usd ?? '', max: org.lending_max_usd ?? '',
  })
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? []))
    supabase.from('countries').select('code, name').order('name').then(({ data }) => setCountries(data ?? []))
  }, [])
  const toggle = (k, v) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }))
  const chip = (on) => `rounded-full border px-3 py-1 text-xs ${on ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy hover:border-navy/40'}`
  async function save(e) {
    e.preventDefault(); setMsg(null)
    const min = f.min === '' ? null : Number(f.min), max = f.max === '' ? null : Number(f.max)
    if (min != null && max != null && min > max) { setMsg({ err: 'The smallest amount is higher than the largest. Swap them or clear one.' }); return }
    const { error } = await supabase.from('organisations').update({
      lending_types: f.types, lending_hs_codes: f.hs, lending_countries: f.countries, lending_min_usd: min, lending_max_usd: max,
    }).eq('id', org.id)
    setMsg(error ? { err: error.message } : { ok: 'Saved. Your Finance requests list now shows the requests that fit you first.' })
    if (!error) refresh()
  }
  return (
    <form onSubmit={save} className="card space-y-4">
      <div><h3 className="text-lg font-semibold">What you finance</h3>
        <p className="text-sm text-navy/60">Tell traders and OXL where you lend. Leave a section empty if you finance everything in it. Requests that fit are shown to you first, and you can still see the rest.</p></div>
      <div><label className="label">Types of finance</label>
        <div className="flex flex-wrap gap-2">{Object.entries(FINANCE_TYPE_LABEL).map(([k, v]) => (
          <button type="button" key={k} className={chip(f.types.includes(k))} onClick={() => toggle('types', k)} title={v.hint}>{v.name}</button>))}</div></div>
      <div><label className="label">Products {f.hs.length === 0 && <span className="font-normal text-navy/50">(all products)</span>}</label>
        <CommodityPicker commodities={commodities} value={f.hs} onChange={(hs) => setF((p) => ({ ...p, hs }))} /></div>
      <div><label className="label">Countries {f.countries.length === 0 && <span className="font-normal text-navy/50">(all countries)</span>}</label>
        <p className="mb-2 text-xs text-navy/60">Matches the trader's country or the country the goods go to.</p>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">{countries.map((c) => (
          <button type="button" key={c.code} className={chip(f.countries.includes(c.code))} onClick={() => toggle('countries', c.code)}>{c.name}</button>))}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Smallest request (USD)</label><input className="input" type="number" min="0" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="e.g. 10000" /></div>
        <div><label className="label">Largest request (USD)</label><input className="input" type="number" min="0" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="e.g. 500000" /></div>
      </div>
      {msg?.err && <p className="text-sm text-red-700">{msg.err}</p>}{msg?.ok && <p className="text-sm text-leaf">{msg.ok}</p>}
      <button className="btn-primary">Save what I finance</button>
    </form>
  )
}
