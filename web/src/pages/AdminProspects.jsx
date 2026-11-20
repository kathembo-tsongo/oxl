// OXL staff: upload prospects found in public sources, score their fit, assign agents and send invitations (user story O5)
import { useEffect, useState } from 'react'
import { supabase, ROLE_LABEL } from '../supabase'
import { ScoreFactors, ScorePill } from '../components/Badges'
import { PageHeader, EmptyState } from '../components/Page'

const STATUS_LABEL = { new: 'New', reviewed: 'Reviewed', invited: 'Invited', claimed: 'Joined OXL', declined: 'Not a fit', opted_out: 'Opted out' }
const COLUMNS = ['name', 'role', 'country', 'city', 'commodities', 'website', 'contact', 'source', 'source_url']
const SAMPLE = `name,role,country,city,commodities,website,contact,source,source_url
Kampala Cocoa Buyers Ltd,importer,UG,Kampala,1801,https://example.ug,info@example.ug,Uganda Export Promotion Board directory,
Tamale Shea Collective,exporter,GH,Tamale,1515,,,GEPA exporter directory,`

// Small CSV reader: handles quoted values with commas
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

export default function AdminProspects() {
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [csv, setCsv] = useState('')
  const [msg, setMsg] = useState(null)
  const [open, setOpen] = useState(null)
  const [copied, setCopied] = useState(null)
  const [filter, setFilter] = useState('active')

  const load = () => supabase.from('prospects').select('*, agent:organisations!prospects_assigned_agent_org_id_fkey(name)')
    .order('fit_score', { ascending: false, nullsFirst: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('organisations').select('id, name, country').eq('role', 'agent').eq('is_suspended', false).order('name').then(({ data }) => setAgents(data ?? []))
  }, [])

  async function upload() {
    setMsg(null)
    const table = parseCsv(csv.trim())
    if (table.length < 2) { setMsg({ err: 'Paste a header row and at least one business.' }); return }
    const head = table[0].map((h) => h.trim().toLowerCase())
    const missing = ['name', 'role', 'country', 'source'].filter((c) => !head.includes(c))
    if (missing.length) { setMsg({ err: `Missing column(s): ${missing.join(', ')}` }); return }
    const get = (r, k) => (r[head.indexOf(k)] ?? '').trim()
    const items = table.slice(1).map((r) => ({
      name: get(r, 'name'), role: get(r, 'role').toLowerCase() === 'importer' ? 'importer' : 'exporter', country: get(r, 'country').toUpperCase() || null,
      city: get(r, 'city') || null, hs_codes: get(r, 'commodities').split(/[;|\s]+/).filter(Boolean), website: get(r, 'website') || null,
      public_contact: get(r, 'contact') || null, source: get(r, 'source') || 'Uploaded list', source_url: get(r, 'source_url') || null,
    })).filter((x) => x.name)
    const { error } = await supabase.from('prospects').insert(items)
    if (error) { setMsg({ err: error.message }); return }
    await supabase.rpc('score_all_prospects')
    setMsg({ ok: `${items.length} prospect(s) added and scored.` }); setCsv(''); load()
  }
  async function readFile(e) { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }
  async function update(p, patch) { const { error } = await supabase.from('prospects').update(patch).eq('id', p.id); if (error) setMsg({ err: error.message }); load() }
  async function invite(p) {
    const link = `${window.location.origin}/invite/${p.invite_token}`
    const text = `Hello ${p.name},\n\nWe are building OXL, a platform that connects verified African businesses, buyers and sellers, between Kenya, Ghana and other markets. We found your business in the ${p.source} and think OXL could help you find ${p.role === 'importer' ? 'verified suppliers' : 'verified buyers'}.\n\nJoin here, or ask us to delete your details: ${link}\n\nOXL team`
    try { await navigator.clipboard.writeText(text); setCopied(p.id) } catch { window.prompt('Copy this invitation:', text) }
    const { data: { user } } = await supabase.auth.getUser()
    await update(p, { status: 'invited', invited_at: new Date().toISOString(), invited_by: user.id })
  }

  const list = rows.filter((p) => filter === 'all' || (filter === 'active' ? ['new', 'reviewed', 'invited'].includes(p.status) : p.status === filter))
  return (
    <div className="space-y-6">
      <PageHeader title="Prospects" subtitle="Businesses found in public sources that are not yet on OXL. Visible only to OXL staff and assigned agents, and never shown as verified." />
      <AiSearch onFound={load} />
      <section className="card space-y-3">
        <h3 className="font-semibold">Add prospects from a spreadsheet</h3>
        <p className="text-xs text-navy/60">Save your spreadsheet as CSV with these columns: <code>{COLUMNS.join(', ')}</code>. Commodities are HS codes separated by semicolons (e.g. <code>1801;1803</code>). Use only public business information.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" onChange={readFile} className="text-sm" />
          <button type="button" className="text-sm text-terra underline" onClick={() => setCsv(SAMPLE)}>Load an example</button>
        </div>
        <textarea className="input font-mono text-xs" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV here" />
        <div className="flex items-center gap-3"><button className="btn-primary" disabled={!csv.trim()} onClick={upload}>Add and score</button>
          <button className="btn-ghost" onClick={async () => { await supabase.rpc('score_all_prospects'); load() }}>Re-score all</button>
          {msg && <span className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</span>}</div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[['active', 'To work on'], ['claimed', 'Joined'], ['declined', 'Not a fit'], ['all', 'All']].map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-md text-sm ${filter === k ? 'bg-navy text-white' : 'border border-line bg-white'}`}>{v}</button>))}
      </div>
      <div className="space-y-3">
        {list.length === 0 && <EmptyState title="No prospects here">Add some from a spreadsheet above, or run the AI search.</EmptyState>}
        {list.map((p) => (
          <div key={p.id} className="card">
            <div className="flex flex-wrap items-center gap-3">
              <ScorePill score={p.fit_score ?? 0} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name} <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-navy/60">Prospect: not on OXL, not verified</span></div>
                <div className="text-xs text-navy/60">{ROLE_LABEL[p.role] ?? p.role} · {p.city ? `${p.city}, ` : ''}{p.country} · HS {(p.hs_codes ?? []).join(', ') || '—'} · source: {p.source}</div>
              </div>
              <span className="text-xs font-medium">{STATUS_LABEL[p.status]}{p.invited_at ? ` · ${new Date(p.invited_at).toLocaleDateString()}` : ''}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
              <select className="input max-w-[16rem] py-1" value={p.assigned_agent_org_id ?? ''} onChange={(e) => update(p, { assigned_agent_org_id: e.target.value || null })}>
                <option value="">Handled by OXL staff</option>{agents.map((a) => <option key={a.id} value={a.id}>Agent: {a.name}</option>)}
              </select>
              <button className="btn-ghost py-1" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide reasons' : 'Why this score?'}</button>
              {['new', 'reviewed', 'invited'].includes(p.status) && <>
                <button className="btn-primary py-1" onClick={() => invite(p)}>{copied === p.id ? 'Invitation copied' : 'Copy invitation'}</button>
                <button className="btn-ghost py-1" onClick={() => update(p, { status: 'declined' })}>Not a fit</button></>}
              <button className="ml-auto text-red-700 hover:underline" onClick={async () => { await supabase.from('prospects').delete().eq('id', p.id); load() }}>Delete</button>
            </div>
            {open === p.id && p.fit_reasons && <div className="mt-3"><ScoreFactors factors={p.fit_reasons} /></div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// AI prospecting (Richmond, 13 Nov 2026): Claude searches public directories and websites; staff review every result
function AiSearch({ onFound }) {
  const [countries, setCountries] = useState([])
  const [products, setProducts] = useState([])
  const [f, setF] = useState({ country: 'GH', hs_code: '', role: 'exporter', limit: 8 })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    supabase.from('countries').select('code, name').order('is_pilot', { ascending: false }).order('name').then(({ data }) => setCountries(data ?? []))
    supabase.from('commodities').select('hs_code, name').eq('is_active', true).order('name').then(({ data }) => setProducts(data ?? []))
  }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function run(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('find-prospects', { body: { ...f, limit: Number(f.limit) } })
    setBusy(false)
    if (error || data?.error) { setMsg({ err: data?.error ?? error.message }); return }
    setMsg({ ok: data.added ? `${data.added} new prospect(s) added for review: ${data.names.join(', ')}.` : 'No new businesses found. Try another product or country.' })
    onFound()
  }
  return (
    <form onSubmit={run} className="card grid gap-3 sm:grid-cols-5">
      <div className="sm:col-span-5"><h3 className="font-semibold">Find prospects with AI</h3>
        <p className="text-xs text-navy/60">Claude searches public sources (export agency and chamber directories, trade fair lists, company websites) and adds what it finds as <b>New</b>, each with the page it came from. Check every one before assigning or inviting it. Only published business contacts are kept.</p></div>
      <div><label className="label">Country</label><select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Product</label><select className="input" required value={f.hs_code} onChange={set('hs_code')}><option value="">Choose…</option>{products.map((p) => <option key={p.hs_code} value={p.hs_code}>{p.name} (HS {p.hs_code})</option>)}</select></div>
      <div><label className="label">Looking for</label><select className="input" value={f.role} onChange={set('role')}><option value="exporter">Sellers</option><option value="importer">Buyers</option></select></div>
      <div><label className="label">How many (max 15)</label><input className="input" type="number" min="1" max="15" value={f.limit} onChange={set('limit')} /></div>
      <div className="sm:col-span-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy || !f.hs_code}>{busy ? 'Searching… (up to a minute)' : 'Search'}</button>
        {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      </div>
    </form>
  )
}
