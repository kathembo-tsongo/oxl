// OXL staff: maintain the data matching depends on (user story O3):
// locations, the route table, destination certificate rules, the sanctions list and the safety margin.
import { useEffect, useState } from 'react'
import { supabase, CERT_LABEL, UNIT_LABEL, CATEGORY_LABEL } from '../supabase'
import LocationSelect from '../components/LocationSelect'

const TABS = { products: 'Products', grades: 'Grades', routes: 'Route table', locations: 'Locations', certs: 'Certificate rules', sanctions: 'Sanctions list', activities: 'Business activities', settings: 'Settings' }

export default function AdminReference() {
  const [tab, setTab] = useState('products')
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
      {tab === 'grades' && <Grades />}
      {tab === 'sanctions' && <Sanctions />}
      {tab === 'products' && <Products />}
      {tab === 'activities' && <BusinessActivities />}
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
  const [v, setV] = useState(null)
  const [msg, setMsg] = useState(null)
  const KEYS = ['safety_margin_days', 'identity_required_for_verification', 'admin_requires_mfa', 'geo_max_km_from_town']
  useEffect(() => {
    supabase.from('settings').select('key, value').in('key', KEYS).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      setV({ safety_margin_days: m.safety_margin_days ?? 10, identity_required_for_verification: String(m.identity_required_for_verification ?? true) !== 'false',
        admin_requires_mfa: String(m.admin_requires_mfa ?? true) !== 'false', geo_max_km_from_town: m.geo_max_km_from_town ?? 50 })
    })
  }, []) // eslint-disable-line
  async function save(e) {
    e.preventDefault(); setMsg(null)
    const now = new Date().toISOString()
    const { error } = await supabase.from('settings').upsert([
      { key: 'safety_margin_days', value: Number(v.safety_margin_days), updated_at: now },
      { key: 'identity_required_for_verification', value: v.identity_required_for_verification, updated_at: now },
      { key: 'admin_requires_mfa', value: v.admin_requires_mfa, updated_at: now },
      { key: 'geo_max_km_from_town', value: Number(v.geo_max_km_from_town), updated_at: now },
    ])
    setMsg(error ? { err: error.message } : { ok: 'Saved.' })
  }
  if (!v) return null
  return (
    <form onSubmit={save} className="card max-w-xl space-y-4">
      <div><h3 className="font-semibold">Delivery-time check</h3>
        <label className="label mt-2">Safety margin (days)</label><input className="input" type="number" min="0" max="60" value={v.safety_margin_days} onChange={(e) => setV({ ...v, safety_margin_days: e.target.value })} />
        <p className="mt-1 text-xs text-navy/60">A seller will pass the timing check only if goods are estimated to arrive at least this many days before the buyer's needed-by date.</p></div>
      <div className="border-t border-line pt-4"><h3 className="font-semibold">Verification</h3>
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={v.identity_required_for_verification} onChange={(e) => setV({ ...v, identity_required_for_verification: e.target.checked })} />
          Require approved identity documents before raising a trust level</label>
        <label className="label mt-3">Flag a pinned location further than (km) from the declared town</label>
        <input className="input" type="number" min="1" max="1000" value={v.geo_max_km_from_town} onChange={(e) => setV({ ...v, geo_max_km_from_town: e.target.value })} /></div>
      <div className="border-t border-line pt-4"><h3 className="font-semibold">Sign-in</h3>
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={v.admin_requires_mfa} onChange={(e) => setV({ ...v, admin_requires_mfa: e.target.checked })} />
          OXL staff must use two-step sign-in (authenticator app)</label>
        <p className="mt-1 text-xs text-navy/60">Recommended: staff see identity documents and set trust levels.</p></div>
      <button className="btn-primary">Save</button><Msg m={msg} />
    </form>
  )
}

// Business activity lists: UN ISIC by default; load each country's own list (e.g. KSIC, GSIC) from a CSV
function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function BusinessActivities() {
  const [rows, setRows] = useState([])
  const [countries, setCountries] = useState([])
  const [filter, setFilter] = useState('')
  const [imp, setImp] = useState({ country: 'KE', scheme: '', parsed: null })
  const [msg, setMsg] = useState(null)
  const load = () => {
    let q = supabase.from('business_categories').select('*').order('scheme').order('code')
    if (filter === 'all') q = q.is('country', null); else if (filter) q = q.eq('country', filter)
    q.then(({ data }) => setRows(data ?? []))
  }
  useEffect(() => { supabase.from('countries').select('code, name').order('name').then(({ data }) => setCountries(data ?? [])) }, [])
  useEffect(() => { load() }, [filter]) // eslint-disable-line

  async function readFile(file) {
    setMsg(null)
    const cells = parseCsv(await file.text())
    if (!cells.length) { setMsg({ err: 'The file is empty.' }); return }
    const head = cells[0].map((h) => h.trim().toLowerCase())
    const ci = (names) => head.findIndex((h) => names.includes(h))
    let [c, n, p] = [ci(['code']), ci(['name', 'description', 'title']), ci(['parent_code', 'parent'])]
    let body = cells.slice(1)
    if (c < 0 || n < 0) { c = 0; n = 1; p = cells[0].length > 2 ? 2 : -1; body = cells } // no header row: code, name, parent
    setImp((x) => ({ ...x, parsed: body.map((r) => ({ code: r[c]?.trim(), name: r[n]?.trim(), parent_code: p >= 0 ? r[p]?.trim() : null })).filter((r) => r.code && r.name) }))
  }
  async function doImport(e) {
    e.preventDefault(); setMsg(null)
    const { data, error } = await supabase.rpc('import_business_categories', { p_country: imp.country || null, p_scheme: imp.scheme, p_rows: imp.parsed })
    setMsg(error ? { err: error.message } : { ok: `${data} activities loaded or updated.` })
    if (!error) { setImp({ ...imp, parsed: null }); setFilter(imp.country || 'all'); load() }
  }
  async function toggle(r) { await supabase.from('business_categories').update({ is_active: !r.is_active }).eq('id', r.id); load() }

  return (
    <div className="space-y-4">
      <form onSubmit={doImport} className="card grid gap-3 sm:grid-cols-4">
        <h3 className="sm:col-span-4 font-semibold">Load a country's list</h3>
        <p className="sm:col-span-4 -mt-2 text-xs text-navy/60">Upload a CSV with the columns <code>code, name, parent_code</code> (e.g. Kenya's KSIC or Ghana's GSIC from the national statistics office). Loading the same list again updates names and adds new codes. Businesses in that country then see it first when choosing their activity; the UN ISIC list stays available everywhere.</p>
        <div><label className="label">Country</label>
          <select className="input" value={imp.country} onChange={(e) => setImp({ ...imp, country: e.target.value })}>
            <option value="">Every country</option>{countries.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></div>
        <div><label className="label">Classification name</label><input className="input" required value={imp.scheme} onChange={(e) => setImp({ ...imp, scheme: e.target.value })} placeholder="e.g. KSIC Rev.1" /></div>
        <div className="sm:col-span-2"><label className="label">CSV file</label><input type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} /></div>
        {imp.parsed && <div className="sm:col-span-4 text-sm">{imp.parsed.length} rows read, e.g. {imp.parsed.slice(0, 3).map((r) => `${r.code} · ${r.name}`).join('; ')}</div>}
        <div className="sm:col-span-4 flex items-center gap-3"><button className="btn-primary" disabled={!imp.parsed?.length || !imp.scheme}>Load activities</button><Msg m={msg} /></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <b className="mr-auto">Activities</b>
          <select className="input max-w-[14rem] py-1" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option><option value="all">Every country (ISIC)</option>{countries.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
        </div>
        <table className="w-full min-w-[40rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Code</th><th>Name</th><th>Classification</th><th>Country</th><th></th></tr></thead>
          <tbody>{rows.slice(0, 500).map((r) => (
            <tr key={r.id} className={`border-t border-line ${r.is_active ? '' : 'text-navy/40'}`}>
              <td className="px-4 py-1.5 tabular-nums">{r.code}</td><td>{r.parent_code ? '\u00a0\u00a0' : ''}{r.name}</td><td className="text-xs">{r.scheme}</td><td>{r.country ?? 'All'}</td>
              <td className="pr-4 text-right"><button className="text-xs text-navy/60" onClick={() => toggle(r)}>{r.is_active ? 'Hide' : 'Show'}</button></td>
            </tr>))}</tbody>
        </table>
        {rows.length > 500 && <p className="px-4 py-2 text-xs text-navy/60">Showing the first 500 of {rows.length}. Filter by country to see more.</p>}
      </div>
    </div>
  )
}

// Products traded on OXL: farm produce and goods beyond farming (Richmond, 13 Nov 2026).
// The unit of sale is what quantities and prices are counted in; weight per unit lets OXL add transport cost.
const NEW_PRODUCT = { hs_code: '', name: '', category: 'manufactured', unit: 'pieces', kg_per_unit: '', is_active: true }
function Products() {
  const [rows, setRows] = useState([])
  const [f, setF] = useState(NEW_PRODUCT)
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('commodities').select('*').order('category').order('name').then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [])
  async function save(row) {
    setMsg(null)
    const { error } = await supabase.from('commodities').upsert({ ...row, hs_code: row.hs_code.trim(), name: row.name.trim(),
      kg_per_unit: row.kg_per_unit === '' || row.kg_per_unit == null ? null : Number(row.kg_per_unit) })
    setMsg(error ? { err: error.message } : { ok: `${row.name} saved.` }); if (!error) load()
    return !error
  }
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="space-y-4">
      <form onSubmit={async (e) => { e.preventDefault(); if (await save(f)) setF(NEW_PRODUCT) }} className="card grid gap-3 sm:grid-cols-6">
        <h3 className="sm:col-span-6 font-semibold">Add a product</h3>
        <p className="sm:col-span-6 -mt-2 text-xs text-navy/60">Use the 4-digit HS code (e.g. 3401 soap, 2523 cement). Quantities and prices for this product are counted in its unit. Weight per unit lets OXL add transport cost to the landed price when the unit is not a weight.</p>
        <div><label className="label">HS code</label><input className="input" required pattern="[0-9]{4,6}" value={f.hs_code} onChange={(e) => setF({ ...f, hs_code: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">Name</label><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">Category</label><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Sold in</label><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Kg per unit</label><input className="input" type="number" step="0.001" min="0" disabled={['t', 'kg'].includes(f.unit)} value={f.kg_per_unit} onChange={(e) => setF({ ...f, kg_per_unit: e.target.value })} /></div>
        <div className="sm:col-span-6 flex items-center gap-3"><button className="btn-primary">Add product</button><Msg m={msg} /></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[52rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">HS</th><th>Name</th><th>Category</th><th>Sold in</th><th>Kg per unit</th><th>Shown</th><th></th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.hs_code} className={`border-t border-line ${r.is_active ? '' : 'bg-cream/60 text-navy/60'}`}>
              <td className="px-4 py-1.5 tabular-nums">{r.hs_code}</td>
              <td><input className="input py-1" value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} /></td>
              <td><select className="input py-1" value={r.category} onChange={(e) => setRow(i, 'category', e.target.value)}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
              <td><select className="input py-1" value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)}>{Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
              <td><input className="input w-24 py-1" type="number" step="0.001" min="0" disabled={['t', 'kg'].includes(r.unit)} value={r.kg_per_unit ?? ''} onChange={(e) => setRow(i, 'kg_per_unit', e.target.value)} /></td>
              <td><input type="checkbox" checked={r.is_active} onChange={(e) => setRow(i, 'is_active', e.target.checked)} aria-label="Shown to users" /></td>
              <td className="pr-4 text-right"><button className="text-xs text-terra" onClick={() => save(r)}>Save</button></td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="text-xs text-navy/60">Hidden products are not offered in sign-up or new listings; existing listings keep working. Add the certificate rules for each new product under <b>Certificate rules</b>.</p>
    </div>
  )
}

function Grades() {
  const [rows, setRows] = useState([])
  const [commodities, setCommodities] = useState([])
  const [hsCode, setHsCode] = useState('')
  const [gradeName, setGradeName] = useState('')
  const [msg, setMsg] = useState(null)
  const load = async () => {
    const [{ data: gradeRows, error }, { data: products }] = await Promise.all([
      supabase.from('commodity_grades').select('hs_code, grade_name, sort_order').order('hs_code').order('sort_order').order('grade_name'),
      supabase.from('commodities').select('hs_code, name').order('name'),
    ])
    if (error) setMsg({ err: error.message })
    else setRows(gradeRows ?? [])
    const productRows = products ?? []
    setCommodities(productRows)
    setHsCode((current) => current || productRows[0]?.hs_code || '')
  }
  useEffect(() => { load() }, [])
  const selectedGrades = rows.filter((r) => r.hs_code === hsCode)

  async function add(e) {
    e.preventDefault()
    setMsg(null)
    const name = gradeName.trim()
    if (!name || !hsCode) return
    const sortOrder = Math.max(0, ...selectedGrades.map((r) => r.sort_order)) + 10
    const { error } = await supabase.from('commodity_grades').insert({ hs_code: hsCode, grade_name: name, sort_order: sortOrder })
    if (error) setMsg({ err: error.message })
    else { setMsg({ ok: 'Grade added.' }); setGradeName(''); load() }
  }

  async function remove(row) {
    setMsg(null)
    const { error } = await supabase.from('commodity_grades').delete().eq('hs_code', row.hs_code).eq('grade_name', row.grade_name)
    if (error) setMsg({ err: error.message })
    else { setMsg({ ok: 'Grade removed.' }); load() }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-4">
        <h3 className="sm:col-span-4 font-semibold">Add a grade suggestion</h3>
        <div className="sm:col-span-2"><label className="label">Commodity</label>
          <select className="input" required value={hsCode} onChange={(e) => setHsCode(e.target.value)}>
            {commodities.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name} (HS {c.hs_code})</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className="label">Grade name</label>
          <input className="input" required value={gradeName} onChange={(e) => setGradeName(e.target.value)} placeholder="e.g. BP1" /></div>
        <div className="sm:col-span-4 flex items-center gap-3"><button className="btn-primary" disabled={!commodities.length}>Add grade</button><Msg m={msg} /></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[32rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="px-4 py-2">Commodity</th><th>Grade suggestion</th><th></th></tr></thead>
          <tbody>{selectedGrades.map((r) => (
            <tr key={`${r.hs_code}-${r.grade_name}`} className="border-t border-line">
              <td className="px-4 py-2">{commodities.find((c) => c.hs_code === r.hs_code)?.name ?? r.hs_code}</td>
              <td>{r.grade_name}</td>
              <td className="pr-4 text-right"><button className="text-red-700 hover:underline" onClick={() => remove(r)}>Delete</button></td>
            </tr>))}
            {selectedGrades.length === 0 && <tr><td className="px-4 py-3 text-navy/60" colSpan="3">No grade suggestions for this commodity yet. Users can still type any grade.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
