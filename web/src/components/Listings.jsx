import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, INCOTERMS } from '../supabase'
import { useAuth } from '../App'
import { DemoBadge, ScoreFactors, ScorePill, TierBadge } from './Badges'

// kind = 'offer' (exporter) or 'request' (importer)
export default function Listings({ kind }) {
  const { org } = useAuth()
  const table = kind === 'offer' ? 'offers' : 'requests'
  const [rows, setRows] = useState([])
  const [commodities, setCommodities] = useState([])
  const [countries, setCountries] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState(null)

  const load = () => supabase.from(table).select('*, commodities(name)').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('commodities').select('*').order('name').then(({ data }) => setCommodities(data ?? []))
    supabase.from('countries').select('*').order('name').then(({ data }) => setCountries(data ?? []))
  }, [org.id]) // eslint-disable-line

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{kind === 'offer' ? 'Your offers' : 'Your sourcing requests'}</h2>
          <p className="text-sm text-navy/60">{kind === 'offer' ? 'What you can supply. OXL ranks buyers for each one.' : 'What you need. OXL ranks verified suppliers for each one.'}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : kind === 'offer' ? '+ New offer' : '+ New request'}</button>
      </div>

      {showForm && <ListingForm kind={kind} org={org} commodities={commodities} countries={countries} onSaved={() => { setShowForm(false); load() }} />}

      {rows.length === 0 && !showForm && <div className="card text-sm text-navy/60">Nothing posted yet.</div>}
      {rows.map((r) => (
        <div key={r.id} className="card">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div className="font-semibold">{r.commodities?.name} <span className="font-normal text-navy/50">HS {r.hs_code}</span></div>
            <div className="text-sm">{r.grade ?? 'Any grade'}</div>
            <div className="text-sm tabular-nums">{Number(r.quantity_tonnes)} t</div>
            <div className="text-sm tabular-nums">{(r.price_usd_per_tonne ?? r.target_price_usd_per_tonne) ? `$${Number(r.price_usd_per_tonne ?? r.target_price_usd_per_tonne).toLocaleString()}/t` : 'Price open'}</div>
            <div className="text-sm">{r.incoterm ?? '—'} · {kind === 'offer' ? `from ${r.origin_country}` : `to ${r.destination_country}`}</div>
            <span className={`text-xs ${r.status === 'open' ? 'text-leaf' : 'text-navy/40'}`}>{r.status}</span>
            <button className="btn-ghost ml-auto" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
              {openId === r.id ? 'Hide matches' : kind === 'offer' ? 'Find buyers' : 'Find suppliers'}
            </button>
          </div>
          {openId === r.id && <Matches kind={kind} listing={r} />}
        </div>
      ))}
      <Interests kind={kind} />
    </section>
  )
}

function ListingForm({ kind, org, commodities, countries, onSaved }) {
  const isOffer = kind === 'offer'
  const [f, setF] = useState({ hs_code: org.hs_codes?.[0] ?? '', grade: '', quantity_tonnes: '', price: '', incoterm: 'FOB', country: org.country, date: '', notes: '' })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault(); setErr(null)
    const row = {
      org_id: org.id, hs_code: f.hs_code, grade: f.grade || null, quantity_tonnes: Number(f.quantity_tonnes),
      incoterm: f.incoterm || null, notes: f.notes || null,
      ...(isOffer
        ? { price_usd_per_tonne: f.price ? Number(f.price) : null, origin_country: f.country, available_from: f.date || null }
        : { target_price_usd_per_tonne: f.price ? Number(f.price) : null, destination_country: f.country, needed_by: f.date || null }),
    }
    const { error } = await supabase.from(isOffer ? 'offers' : 'requests').insert(row)
    if (error) setErr(error.message); else onSaved()
  }
  return (
    <form onSubmit={save} className="card grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2"><label className="label">Commodity</label>
        <select className="input" required value={f.hs_code} onChange={set('hs_code')}>
          <option value="">Choose…</option>
          {commodities.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name} (HS {c.hs_code})</option>)}
        </select></div>
      <div><label className="label">Grade</label><input className="input" value={f.grade} onChange={set('grade')} placeholder="e.g. Grade I, W320, AA" /></div>
      <div><label className="label">Quantity (tonnes)</label><input className="input" type="number" step="0.01" min="0.01" required value={f.quantity_tonnes} onChange={set('quantity_tonnes')} /></div>
      <div><label className="label">{isOffer ? 'Price' : 'Target price'} (USD/t)</label><input className="input" type="number" step="0.01" value={f.price} onChange={set('price')} /></div>
      <div><label className="label">Incoterm</label><select className="input" value={f.incoterm} onChange={set('incoterm')}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</select></div>
      <div><label className="label">{isOffer ? 'Origin' : 'Destination'}</label>
        <select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
      <div><label className="label">{isOffer ? 'Available from' : 'Needed by'}</label><input className="input" type="date" value={f.date} onChange={set('date')} /></div>
      <div className="sm:col-span-4"><label className="label">Notes</label><input className="input" value={f.notes} onChange={set('notes')} /></div>
      {err && <p className="sm:col-span-4 text-sm text-red-700">{err}</p>}
      <div className="sm:col-span-4"><button className="btn-primary">Post {isOffer ? 'offer' : 'request'}</button></div>
    </form>
  )
}

function Matches({ kind, listing }) {
  const { org } = useAuth()
  const [rows, setRows] = useState(null)
  const [sent, setSent] = useState({})
  const [err, setErr] = useState(null)
  useEffect(() => {
    const rpc = kind === 'offer' ? supabase.rpc('match_offer', { p_offer_id: listing.id }) : supabase.rpc('match_request', { p_request_id: listing.id })
    rpc.then(({ data, error }) => { if (error) setErr(error.message); setRows(data ?? []) })
    supabase.from('interests').select('offer_id, request_id').eq(kind === 'offer' ? 'offer_id' : 'request_id', listing.id)
      .then(({ data }) => setSent(Object.fromEntries((data ?? []).map((i) => [kind === 'offer' ? i.request_id : i.offer_id, true]))))
  }, [listing.id, kind])

  async function express(m) {
    const otherId = kind === 'offer' ? m.request_id : m.offer_id
    const row = kind === 'offer'
      ? { offer_id: listing.id, request_id: otherId, initiated_by: org.id, match_score: m.score }
      : { offer_id: otherId, request_id: listing.id, initiated_by: org.id, match_score: m.score }
    const { error } = await supabase.from('interests').insert(row)
    if (error) setErr(error.message); else setSent({ ...sent, [otherId]: true })
  }

  if (!rows) return <p className="mt-4 text-sm text-navy/60">Matching…</p>
  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
      {err && <p className="text-sm text-red-700">{err}</p>}
      {rows.length === 0 && <p className="text-sm text-navy/60">No open {kind === 'offer' ? 'requests' : 'offers'} for this commodity yet.</p>}
      {rows.map((m) => {
        const otherId = kind === 'offer' ? m.request_id : m.offer_id
        return (
          <div key={otherId} className="grid gap-4 rounded-lg bg-cream p-4 md:grid-cols-[auto_14rem_1fr_auto]">
            <ScorePill score={m.score} />
            <div>
              <div className="font-medium">{m.org_name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-navy/60">{m.org_country} <TierBadge tier={m.verification_tier} /> <DemoBadge show={m.is_demo} /></div>
            </div>
            <ScoreFactors factors={m.factors} />
            <div className="flex flex-col gap-2">
              <button className="btn-primary" disabled={sent[otherId]} onClick={() => express(m)}>{sent[otherId] ? 'Interest sent' : 'Express interest'}</button>
              <Link className="btn-ghost" to={`/report/${m.org_id}`}>Risk report</Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Interests({ kind }) {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const load = () => supabase.from('interests')
    .select('*, offers(id, grade, quantity_tonnes, org_id, organisations(name), commodities(name)), requests(id, grade, quantity_tonnes, org_id, organisations(name))')
    .order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, []) // eslint-disable-line
  async function setStatus(id, status) { await supabase.from('interests').update({ status }).eq('id', id); load() }
  if (!rows.length) return null
  return (
    <div className="card">
      <h3 className="text-lg font-semibold">Deal pipeline</h3>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="py-1">Counterparty</th><th>Commodity</th><th>Score</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((i) => {
            const other = kind === 'offer' ? i.requests?.organisations?.name : i.offers?.organisations?.name
            const incoming = i.initiated_by !== org.id
            return (
              <tr key={i.id} className="border-t border-line">
                <td className="py-2">{other} {incoming && <span className="ml-1 text-xs text-terra">incoming</span>}</td>
                <td>{i.offers?.commodities?.name}</td>
                <td className="tabular-nums">{i.match_score}</td>
                <td>{i.status}</td>
                <td className="space-x-2 text-right">
                  {incoming && i.status === 'proposed' && <>
                    <button className="text-leaf" onClick={() => setStatus(i.id, 'accepted')}>Accept</button>
                    <button className="text-navy/50" onClick={() => setStatus(i.id, 'declined')}>Decline</button></>}
                  {i.status === 'accepted' && <button className="text-leaf" onClick={() => setStatus(i.id, 'completed')}>Mark trade completed</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
