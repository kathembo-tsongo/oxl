// OXL staff: maintain the data matching depends on (user story O3):
// locations, the route table, destination certificate rules, the sanctions list and the safety margin.
import { useEffect, useState } from 'react'
import { supabase, CERT_LABEL } from '../supabase'
import LocationSelect from '../components/LocationSelect'

const TABS = { routes: 'Route table', locations: 'Locations', certs: 'Certificate rules', sanctions: 'Sanctions list', settings: 'Settings' }

export default function AdminReference() {
  const [tab, setTab] = useState('routes')
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Reference data</h2>
        <p className="text-sm text-navy/60">The data OXL uses to check delivery times, certificates and sanctions. Only OXL staff can change it.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TABS).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md text-sm ${tab === k ? 'bg-navy text-white' : 'border border-line bg-white'}`}>{v}</button>
        ))}
      </div>
      {tab === 'routes' && <RouteTable />}
      {tab === 'locations' && <Locations />}
      {tab === 'certs' && <CertRules />}
      {tab === 'sanctions' && <Sanctions />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

const Msg = ({ m }) => (m ? <p className={`text-sm ${m.err ? 'text-red-700' : 'text-leaf'}`}>{m.err ?? m.ok}</p> : null)

function RouteTable() {
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ from: null, to: null, mode: 'sea', inland_days: 0, port_days: 0, transit_days: '', customs_days: 0, cost: '', source: '' })
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('routes').select('*, a:locations!routes_from_location_id_fkey(name, country), b:locations!routes_to_location_id_fkey(name, country)')
    .order('updated_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('routes').upsert({
      from_location_id: f.from, to_location_id: f.to, mode: f.mode, inland_days: Number(f.inland_days), port_days: Number(f.port_days),
      transit_days: Number(f.transit_days), customs_days: Number(f.customs_days), cost_usd_per_tonne: f.cost === '' ? null : Number(f.cost),
      source: f.source, updated_at: new Date().toISOString(),
    }, { onConflict: 'from_location_id,to_location_id,mode' })
    setMsg(error ? { err: error.message } : { ok: 'Route saved.' }); if (!error) load()
  }
  async function remove(id) { await supabase.from('routes').delete().eq('id', id); load() }
  const edit = (r) => setF({ from: r.from_location_id, to: r.to_location_id, mode: r.mode, inland_days: r.inland_days, port_days: r.port_days,
    transit_days: r.transit_days, customs_days: r.customs_days, cost: r.cost_usd_per_tonne ?? '', source: r.source })

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-4">
        <h3 className="sm:col-span-4 font-semibold">Add or update a route</h3>
        <p className="sm:col-span-4 -mt-2 text-xs text-navy/60">Estimated arrival = ready date + to port/border + port handling + transit + customs and onward delivery. Saving an existing from/to/mode replaces it.</p>
        <div className="sm:col-span-2"><label className="label">From</label><LocationSelect value={f.from} onChange={(v) => setF({ ...f, from: v })} /></div>
        <div className="sm:col-span-2"><label className="label">To</label><LocationSelect value={f.to} onChange={(v) => setF({ ...f, to: v })} /></div>
        <div><label className="label">Mode</label><select className="input" value={f.mode} onChange={set('mode')}><option value="sea">Sea</option><option value="road">Road</option><option value="air">Air</option></select></div>
        <div><label className="label">To port / border (days)</label><input className="input" type="number" min="0" required value={f.inland_days} onChange={set('inland_days')} /></div>
        <div><label className="label">Port handling (days)</label><input className="input" type="number" min="0" required value={f.port_days} onChange={set('port_days')} /></div>
        <div><label className="label">Transit (days)</label><input className="input" type="number" min="0" required value={f.transit_days} onChange={set('transit_days')} /></div>
        <div><label className="label">Customs and onward (days)</label><input className="input" type="number" min="0" required value={f.customs_days} onChange={set('customs_days')} /></div>
        <div><label className="label">Cost (USD per tonne)</label><input className="input" type="number" min="0" step="0.01" value={f.cost} onChange={set('cost')} /></div>
        <div className="sm:col-span-2"><label className="label">Source</label><input className="input" required value={f.source} onChange={set('source')} placeholder="e.g. Quote from XYZ Forwarders, 20 Nov 2026" /></div>
        <div className="sm:col-span-4 flex items-center gap-3"><button className="btn-primary" disabled={!f.from || !f.to}>Save route</button><Msg m={msg} /></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">From → To</th><th>Mode</th><th className="text-right">Total days</th><th className="text-right">USD/t</th><th>Source</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="px-4 py-2">{r.a?.name} ({r.a?.country}) → {r.b?.name} ({r.b?.country})</td>
              <td className="capitalize">{r.mode}</td>
              <td className="text-right tabular-nums" title={`${r.inland_days} + ${r.port_days} + ${r.transit_days} + ${r.customs_days}`}>{r.total_days}</td>
              <td className="text-right tabular-nums">{r.cost_usd_per_tonne != null ? Number(r.cost_usd_per_tonne).toLocaleString() : '—'}</td>
              <td className={`max-w-[16rem] truncate text-xs ${r.source.startsWith('Indicative') ? 'text-terra' : 'text-navy/60'}`} title={r.source}>{r.source}</td>
              <td className="space-x-2 whitespace-nowrap pr-4 text-right"><button className="text-navy/70 hover:underline" onClick={() => edit(r)}>Edit</button><button className="text-red-700 hover:underline" onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function Locations() {
  const [rows, setRows] = useState([])
  const [countries, setCountries] = useState([])
  const [f, setF] = useState({ name: '', country: 'KE', kind: 'town', lat: '', lon: '' })
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('locations').select('*').order('country').order('name').then(({ data }) => setRows(data ?? []))
  useEffect(() => { load(); supabase.from('countries').select('*').order('name').then(({ data }) => setCountries(data ?? [])) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('locations').insert({ name: f.name, country: f.country, kind: f.kind, lat: f.lat === '' ? null : Number(f.lat), lon: f.lon === '' ? null : Number(f.lon) })
    setMsg(error ? { err: error.message } : { ok: 'Location added. Reload the page to see it in pickers.' }); if (!error) { setF({ ...f, name: '', lat: '', lon: '' }); load() }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-5">
        <h3 className="sm:col-span-5 font-semibold">Add a location</h3>
        <div className="sm:col-span-2"><label className="label">Name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
        <div><label className="label">Country</label><select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
        <div><label className="label">Type</label><select className="input" value={f.kind} onChange={set('kind')}><option value="town">Town</option><option value="port">Port</option><option value="border">Border post</option><option value="airport">Airport</option></select></div>
        <div className="flex items-end"><button className="btn-primary w-full">Add</button></div>
        <div><label className="label">Latitude</label><input className="input" type="number" step="0.000001" value={f.lat} onChange={set('lat')} placeholder="e.g. -1.2921" /></div>
        <div><label className="label">Longitude</label><input className="input" type="number" step="0.000001" value={f.lon} onChange={set('lon')} placeholder="e.g. 36.8219" /></div>
        <div className="sm:col-span-3 flex items-end"><Msg m={msg} /></div>
      </form>
      <div className="card grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {rows.map((l) => <div key={l.id} className="flex justify-between gap-2 border-b border-line py-1"><span>{l.name} <span className="text-xs text-navy/50">{l.kind}</span></span><span className="text-xs text-navy/50">{l.country}</span></div>)}
      </div>
    </div>
  )
}

function CertRules() {
  const [rows, setRows] = useState([])
  const [commodities, setCommodities] = useState([])
  const [countries, setCountries] = useState([])
  const [f, setF] = useState({ country: 'KE', hs: '', cert: 'phytosanitary', mandatory: true, notes: '' })
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('destination_requirements').select('*, commodities(name)').order('destination_country').order('hs_code').then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? []))
    supabase.from('countries').select('*').order('name').then(({ data }) => setCountries(data ?? []))
  }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('destination_requirements').insert({ destination_country: f.country, hs_code: f.hs || null, certificate: f.cert, is_mandatory: f.mandatory, notes: f.notes || null })
    setMsg(error ? { err: error.message } : { ok: 'Rule added.' }); if (!error) load()
  }
  async function remove(id) { await supabase.from('destination_requirements').delete().eq('id', id); load() }
  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-4">
        <h3 className="sm:col-span-4 font-semibold">Add a rule</h3>
        <p className="sm:col-span-4 -mt-2 text-xs text-navy/60">A mandatory certificate is a must-pass check: sellers without it will not be matched with buyers in that country.</p>
        <div><label className="label">Destination</label><select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
        <div><label className="label">Product</label><select className="input" value={f.hs} onChange={set('hs')}><option value="">All products</option>{commodities.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name}</option>)}</select></div>
        <div><label className="label">Certificate</label><select className="input" value={f.cert} onChange={set('cert')}>{Object.entries(CERT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mandatory} onChange={(e) => setF({ ...f, mandatory: e.target.checked })} /> Mandatory</label></div>
        <div className="sm:col-span-3"><label className="label">Notes / source</label><input className="input" value={f.notes} onChange={set('notes')} /></div>
        <div className="flex items-end"><button className="btn-primary w-full">Add rule</button></div>
        <div className="sm:col-span-4"><Msg m={msg} /></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Destination</th><th>Product</th><th>Certificate</th><th>Required</th><th>Notes</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="px-4 py-2">{r.destination_country}</td><td>{r.commodities?.name ?? 'All products'}</td><td>{CERT_LABEL[r.certificate] ?? r.certificate}</td>
              <td>{r.is_mandatory ? 'Mandatory' : 'Optional'}</td><td className="max-w-[18rem] truncate text-xs text-navy/60" title={r.notes ?? ''}>{r.notes}</td>
              <td className="pr-4 text-right"><button className="text-red-700 hover:underline" onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function Sanctions() {
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ name: '', country: '', list_name: 'UN Security Council Consolidated List', listed_on: '', source_url: '' })
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('sanctions_entries').select('*').order('name').then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('sanctions_entries').insert({ name: f.name, country: f.country || null, list_name: f.list_name, listed_on: f.listed_on || null, source_url: f.source_url || null })
    setMsg(error ? { err: error.message } : { ok: 'Entry added.' }); if (!error) { setF({ ...f, name: '' }); load() }
  }
  async function remove(id) { await supabase.from('sanctions_entries').delete().eq('id', id); load() }
  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-4">
        <h3 className="sm:col-span-4 font-semibold">Add a sanctioned name</h3>
        <p className="sm:col-span-4 -mt-2 text-xs text-navy/60">Businesses whose name matches an entry will not be matched with anyone. Copy entries from official lists only.</p>
        <div className="sm:col-span-2"><label className="label">Name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
        <div><label className="label">Country code</label><input className="input" maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} placeholder="e.g. GH" /></div>
        <div><label className="label">Listed on</label><input className="input" type="date" value={f.listed_on} onChange={set('listed_on')} /></div>
        <div className="sm:col-span-2"><label className="label">List</label><input className="input" required value={f.list_name} onChange={set('list_name')} /></div>
        <div><label className="label">Source link</label><input className="input" value={f.source_url} onChange={set('source_url')} /></div>
        <div className="flex items-end"><button className="btn-primary w-full">Add</button></div>
        <div className="sm:col-span-4"><Msg m={msg} /></div>
      </form>
      <div className="card text-sm">
        {rows.length === 0 ? <p className="text-navy/60">The list is empty.</p> : rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2">
            <span className="font-medium">{r.name}</span><span className="text-xs text-navy/50">{r.country ?? ''} · {r.list_name}{r.listed_on ? ` · ${r.listed_on}` : ''}</span>
            <button className="ml-auto text-red-700 hover:underline" onClick={() => remove(r.id)}>Delete</button>
          </div>))}
      </div>
    </div>
  )
}

function Settings() {
  const [margin, setMargin] = useState('')
  const [msg, setMsg] = useState(null)
  useEffect(() => { supabase.from('settings').select('value').eq('key', 'safety_margin_days').maybeSingle().then(({ data }) => setMargin(data?.value ?? 10)) }, [])
  async function save(e) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.from('settings').upsert({ key: 'safety_margin_days', value: Number(margin), updated_at: new Date().toISOString() })
    setMsg(error ? { err: error.message } : { ok: 'Saved.' })
  }
  return (
    <form onSubmit={save} className="card max-w-md space-y-3">
      <h3 className="font-semibold">Delivery-time check</h3>
      <div><label className="label">Safety margin (days)</label><input className="input" type="number" min="0" max="60" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
      <p className="text-xs text-navy/60">A seller will pass the timing check only if goods are estimated to arrive at least this many days before the buyer's needed-by date.</p>
      <button className="btn-primary">Save</button><Msg m={msg} />
    </form>
  )
}
