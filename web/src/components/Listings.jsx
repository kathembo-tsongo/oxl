import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReportProblem, SafetyBadge } from './Safety'
import { certsFor, UNIT_LABEL, UNIT_SHORT, supabase, INCOTERMS, CERT_LABEL, TRANSPORT_LABEL, ENTITY_LABEL } from '../supabase'
import { useAuth } from '../App'
import { DemoBadge, ScoreFactors, ScorePill, TierBadge } from './Badges'
import LocationSelect from './LocationSelect'

const u = (r) => UNIT_SHORT[r.commodities?.unit ?? 't'] ?? 't'
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null)

// kind = 'offer' (exporter's supply listing) or 'request' (importer's purchase offer).
// The buyer makes the offer and the seller replies, so deals are started from the importer's side only.
// forOrg lets an agent manage listings for a client; it defaults to the signed-in organisation.
export default function Listings({ kind, forOrg }) {
  const { org: myOrg } = useAuth()
  const org = forOrg ?? myOrg
  const isOffer = kind === 'offer'
  const table = isOffer ? 'offers' : 'requests'
  const [rows, setRows] = useState([])
  const [commodities, setCommodities] = useState([])
  const [gradesByHs, setGradesByHs] = useState({})
  const [countries, setCountries] = useState([])
  const [locations, setLocations] = useState({})
  const [editing, setEditing] = useState(null) // null = closed, 'new' = new listing, or the row being edited
  const [openId, setOpenId] = useState(null)
  const [err, setErr] = useState(null)

  const load = () => supabase.from(table).select('*, commodities(name, unit, category)').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('commodities').select('*').eq('is_active', true).order('name').then(({ data }) => setCommodities(data ?? []))
    supabase.from('commodity_grades').select('hs_code, grade_name, sort_order').order('sort_order').order('grade_name').then(({ data }) => {
      const byHs = {}
      for (const row of data ?? []) (byHs[row.hs_code] ??= []).push(row.grade_name)
      setGradesByHs(byHs)
    })
    supabase.from('countries').select('*').order('name').then(({ data }) => setCountries(data ?? []))
    supabase.from('locations').select('id, name, country').then(({ data }) => setLocations(Object.fromEntries((data ?? []).map((l) => [l.id, l]))))
  }, [org.id]) // eslint-disable-line

  async function setStatus(r, status) {
    setErr(null)
    const { error } = await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) setErr(error.message); load()
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{isOffer ? 'Supply listings' : 'Purchase offers'}{forOrg ? ` for ${org.name}` : ''}</h2>
          <p className="text-sm text-navy/60">{isOffer
            ? 'What can be supplied, and when it will be ready. OXL ranks buyers for each one. Buyers send you purchase offers; you accept, accept with terms, or decline.'
            : 'What you want to buy, and by when. OXL ranks suppliers who can deliver in time. You make the offer; the seller accepts, adds terms, or declines.'}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(editing ? null : 'new')}>{editing ? 'Cancel' : isOffer ? '+ New supply listing' : '+ New purchase offer'}</button>
      </div>

      {editing && <ListingForm key={editing === 'new' ? 'new' : editing.id} kind={kind} org={org} row={editing === 'new' ? null : editing}
        commodities={commodities} countries={countries} gradesByHs={gradesByHs} onSaved={() => { setEditing(null); load() }} />}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {rows.length === 0 && !editing && <div className="card text-sm text-navy/60">Nothing posted yet.</div>}
      {rows.map((r) => {
        const loc = locations[isOffer ? r.collection_location_id : r.delivery_location_id]
        const certs = isOffer ? r.certificates : r.preferred_certificates
        return (
          <div key={r.id} className={`card ${r.status !== 'open' ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <div className="font-semibold">{r.commodities?.name} <span className="font-normal text-navy/50">HS {r.hs_code}</span></div>
              <div className="text-sm">{r.grade ?? 'Any grade'}</div>
              <div className="text-sm tabular-nums">{Number(r.quantity_tonnes).toLocaleString()} {u(r)}{isOffer && r.monthly_capacity_tonnes ? ` · ${Number(r.monthly_capacity_tonnes).toLocaleString()} ${u(r)}/month` : ''}{!isOffer && r.min_quantity_tonnes ? ` (min ${Number(r.min_quantity_tonnes).toLocaleString()} ${u(r)})` : ''}</div>
              <div className="text-sm tabular-nums">{(r.price_usd_per_tonne ?? r.target_price_usd_per_tonne) ? `$${Number(r.price_usd_per_tonne ?? r.target_price_usd_per_tonne).toLocaleString()}/${u(r)}` : 'Price open'}</div>
              <div className="text-sm">{r.incoterm ?? '—'}</div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'open' ? 'bg-leaf/10 text-leaf' : 'bg-gray-100 text-navy/50'}`}>{r.status}</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => setEditing(r)}>Edit</button>
                <button className="btn-ghost" onClick={() => setStatus(r, r.status === 'open' ? 'closed' : 'open')}>{r.status === 'open' ? 'Close' : 'Reopen'}</button>
                {r.status === 'open' && (
                  <button className="btn-primary" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    {openId === r.id ? 'Hide matches' : isOffer ? 'Find buyers' : 'Find suppliers'}
                  </button>
                )}
              </div>
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-navy/70">
              <div><dt className="inline text-navy/50">{isOffer ? 'Ready: ' : 'Needed by: '}</dt><dd className="inline font-medium">{fmtDate(isOffer ? r.available_from : r.needed_by) ?? 'not set'}</dd></div>
              <div><dt className="inline text-navy/50">{isOffer ? 'Collect from: ' : 'Deliver to: '}</dt><dd className="inline">{loc ? `${loc.name}, ${loc.country}` : (isOffer ? r.origin_country : r.destination_country)}</dd></div>
              {!isOffer && <div><dt className="inline text-navy/50">Transport: </dt><dd className="inline">{TRANSPORT_LABEL[r.transport_mode] ?? 'Any'}</dd></div>}
              {isOffer && r.goods_owner === 'producer' && <div><dt className="inline text-navy/50">Goods owner: </dt><dd className="inline font-medium">{r.goods_owner_name}{r.commission_pct != null ? ` · ${Number(r.commission_pct)}% commission` : ''}</dd></div>}
              {isOffer && r.harvest_season && <div><dt className="inline text-navy/50">Season: </dt><dd className="inline">{r.harvest_season}</dd></div>}
              {certs?.length > 0 && <div><dt className="inline text-navy/50">{isOffer ? 'Certificates: ' : 'Wants: '}</dt><dd className="inline">{certs.map((c) => CERT_LABEL[c]?? c).join(', ')}</dd></div>}
            </dl>
            {openId === r.id && <Matches kind={kind} listing={r} actingOrg={org} />}
          </div>
        )
      })}
      <Interests kind={kind} actingOrg={org} />
    </section>
  )
}

function ListingForm({ kind, org, row, commodities, countries, gradesByHs, onSaved }) {
  const isOffer = kind === 'offer'
  const [f, setF] = useState(() => ({
    hs_code: row?.hs_code ?? org.hs_codes?.[0] ?? '', grade: row?.grade ?? '', quantity_tonnes: row?.quantity_tonnes ?? '',
    price: (isOffer ? row?.price_usd_per_tonne : row?.target_price_usd_per_tonne) ?? '', incoterm: row?.incoterm ?? 'FOB',
    country: (isOffer ? row?.origin_country : row?.destination_country) ?? org.country,
    date: (isOffer ? row?.available_from : row?.needed_by) ?? '', notes: row?.notes ?? '',
    location: (isOffer ? row?.collection_location_id : row?.delivery_location_id) ?? null,
    capacity: row?.monthly_capacity_tonnes ?? '', season: row?.harvest_season ?? '', min_qty: row?.min_quantity_tonnes ?? '',
    mode: row?.transport_mode ?? 'any', certs: (isOffer ? row?.certificates : row?.preferred_certificates) ?? [],
    goods_owner: row?.goods_owner ?? 'own', seller_producer_id: row?.seller_producer_id ?? '', commission: row?.commission_pct ?? '',
  }))
  const product = commodities.find((c) => c.hs_code === f.hs_code) ?? row?.commodities
  const unit = product?.unit ?? 't'
  const gradeOptions = gradesByHs[f.hs_code] ?? []
  const sellsForOthers = isOffer && ['trader', 'cooperative'].includes(org.entity_type)
  const [producers, setProducers] = useState([])
  useEffect(() => {
    if (!sellsForOthers) return
    supabase.from('seller_producers').select('id, producer_name, commission_pct, producer:organisations!seller_producers_producer_org_id_fkey(name)')
      .eq('seller_org_id', org.id).is('withdrawn_at', null).then(({ data }) => setProducers(data ?? []))
  }, [org.id, sellsForOthers])
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggleCert = (c) => setF({ ...f, certs: f.certs.includes(c) ? f.certs.filter((x) => x !== c) : [...f.certs, c] })
  const num = (v) => (v === '' || v == null ? null : Number(v))

  async function save(e) {
    e.preventDefault(); setErr(null)
    const data = {
      org_id: org.id, hs_code: f.hs_code, grade: f.grade || null, quantity_tonnes: Number(f.quantity_tonnes),
      incoterm: f.incoterm || null, notes: f.notes || null, updated_at: new Date().toISOString(),
      ...(isOffer
        ? { price_usd_per_tonne: num(f.price), origin_country: f.country, available_from: f.date || null, collection_location_id: f.location,
            monthly_capacity_tonnes: num(f.capacity), harvest_season: f.season || null, certificates: f.certs,
            goods_owner: sellsForOthers ? f.goods_owner : 'own',
            seller_producer_id: sellsForOthers && f.goods_owner === 'producer' ? (f.seller_producer_id || null) : null,
            commission_pct: sellsForOthers && f.goods_owner === 'producer' ? num(f.commission) : null }
        : { target_price_usd_per_tonne: num(f.price), destination_country: f.country, needed_by: f.date || null, delivery_location_id: f.location,
            min_quantity_tonnes: num(f.min_qty), transport_mode: f.mode, preferred_certificates: f.certs }),
    }
    const q = supabase.from(isOffer ? 'offers' : 'requests')
    const { error } = row ? await q.update(data).eq('id', row.id) : await q.insert(data)
    if (error) setErr(error.message); else onSaved()
  }

  return (
    <form onSubmit={save} className="card grid gap-3 sm:grid-cols-4">
      <h3 className="sm:col-span-4 text-lg font-semibold">{row ? 'Edit' : 'New'} {isOffer ? 'supply listing' : 'purchase offer'}</h3>
      <div className="sm:col-span-2"><label className="label">Commodity</label>
        <select className="input" required value={f.hs_code} onChange={set('hs_code')}>
          <option value="">Choose…</option>
          {commodities.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name} (HS {c.hs_code})</option>)}
          {row && !commodities.some((c) => c.hs_code === row.hs_code) && <option value={row.hs_code}>{row.commodities?.name ?? row.hs_code}</option>}
        </select></div>
      <GradeCombobox kind={kind} value={f.grade} options={gradeOptions} onChange={(value) => setF({ ...f, grade: value })} />
      <div><label className="label">Quantity ({UNIT_LABEL[unit]})</label><input className="input" type="number" step="0.01" min="0.01" required value={f.quantity_tonnes} onChange={set('quantity_tonnes')} /></div>
      {isOffer
        ? <div><label className="label">Monthly capacity ({UNIT_SHORT[unit]})</label><input className="input" type="number" step="0.01" min="0.01" value={f.capacity} onChange={set('capacity')} placeholder="optional" /></div>
        : <div><label className="label">Minimum order ({UNIT_SHORT[unit]})</label><input className="input" type="number" step="0.01" min="0.01" value={f.min_qty} onChange={set('min_qty')} placeholder="optional" /></div>}
      <div><label className="label">{isOffer ? 'Price' : 'Target price'} (USD per {UNIT_SHORT[unit] === 't' ? 'tonne' : UNIT_SHORT[unit]})</label><input className="input" type="number" step="0.01" value={f.price} onChange={set('price')} /></div>
      <div><label className="label">Incoterm</label><select className="input" value={f.incoterm} onChange={set('incoterm')}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</select></div>
      <div><label className="label">{isOffer ? 'Ready date' : 'Needed by'}</label><input className="input" type="date" required value={f.date} onChange={set('date')} /></div>
      <div><label className="label">{isOffer ? 'Origin country' : 'Destination country'}</label>
        <select className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value, location: null })}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">{isOffer ? 'Collection town or port' : 'Delivery town or port'}</label>
        <LocationSelect country={f.country} value={f.location} onChange={(v) => setF({ ...f, location: v })} /></div>
      {isOffer
        ? <div className="sm:col-span-2"><label className="label">Harvest season</label><input className="input" value={f.season} onChange={set('season')} placeholder="e.g. Main crop Oct–Mar" /></div>
        : <div className="sm:col-span-2"><label className="label">Transport</label>
            <select className="input" value={f.mode} onChange={set('mode')}>{Object.entries(TRANSPORT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
      {sellsForOthers && (
        <div className="sm:col-span-4 grid gap-3 rounded-lg border border-line bg-cream p-3 sm:grid-cols-4">
          <div><label className="label">Whose goods are these?</label>
            <select className="input" value={f.goods_owner} onChange={set('goods_owner')}>
              <option value="own">{org.entity_type === 'cooperative' ? 'Our own stock' : 'My own stock'}</option>
              <option value="producer">{org.entity_type === 'cooperative' ? 'A member’s produce' : 'A producer’s goods (I sell on commission)'}</option>
            </select></div>
          {f.goods_owner === 'producer' && <>
            <div className="sm:col-span-2"><label className="label">Producer</label>
              <select className="input" required value={f.seller_producer_id} onChange={(e) => {
                const p = producers.find((x) => x.id === e.target.value)
                setF({ ...f, seller_producer_id: e.target.value, commission: p?.commission_pct ?? f.commission })
              }}>
                <option value="">Choose…</option>
                {producers.map((p) => <option key={p.id} value={p.id}>{p.producer?.name ?? p.producer_name}</option>)}
              </select>
              {producers.length === 0 && <p className="mt-1 text-xs text-navy/60">Add producers on your <Link className="text-terra" to="/profile">Profile</Link> page first.</p>}</div>
            <div><label className="label">Commission (%)</label><input className="input" type="number" step="0.1" min="0" max="50" value={f.commission} onChange={set('commission')} /></div>
          </>}
        </div>
      )}
      <div className="sm:col-span-4"><label className="label">{isOffer ? 'Certificates held' : 'Certificates wanted'}</label>
        <div className="flex flex-wrap gap-2">{Object.entries(CERT_LABEL).filter(([k]) => certsFor(product?.category).includes(k) || f.certs.includes(k)).map(([k, v]) => (
          <button type="button" key={k} onClick={() => toggleCert(k)}
            className={`rounded-full border px-3 py-1 text-xs ${f.certs.includes(k) ? 'border-leaf bg-leaf text-white' : 'border-line bg-white'}`}>{v}</button>))}</div></div>
      <div className="sm:col-span-4"><label className="label">Notes</label><input className="input" value={f.notes} onChange={set('notes')} /></div>
      {err && <p className="sm:col-span-4 text-sm text-red-700">{err}</p>}
      <div className="sm:col-span-4"><button className="btn-primary">{row ? 'Save changes' : `Post ${isOffer ? 'supply listing' : 'purchase offer'}`}</button></div>
    </form>
  )
}

function GradeCombobox({ kind, value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = `grade-options-${kind}`
  const filteredOptions = options.filter((grade) => grade.toLowerCase().includes(value.trim().toLowerCase()))
  const choose = (grade) => { onChange(grade); setOpen(false); setActiveIndex(-1) }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, filteredOptions.length - 1))
    } else if (e.key === 'ArrowUp' && open && filteredOptions.length) {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && activeIndex >= 0 && filteredOptions[activeIndex]) {
      e.preventDefault()
      choose(filteredOptions[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="relative">
      <label className="label" htmlFor={`grade-${kind}`}>Grade</label>
      <input id={`grade-${kind}`} className="input" role="combobox" aria-autocomplete="list" aria-expanded={open && filteredOptions.length > 0}
        aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1) }}
        onFocus={() => setOpen(options.length > 0)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        placeholder={options.length ? 'Choose or type' : 'Type any grade'} />
      {open && filteredOptions.length > 0 && <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-line bg-white py-1 shadow-lg">
        {filteredOptions.map((grade, index) => (
          <li id={`${listId}-${index}`} key={grade} role="option" aria-selected={index === activeIndex}
            className={`cursor-pointer px-3 py-2 text-sm ${index === activeIndex ? 'bg-cream' : 'hover:bg-cream'}`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => choose(grade)}>{grade}</li>
        ))}
      </ul>}
    </div>
  )
}

function Matches({ kind, listing, actingOrg }) {
  const { org: myOrg } = useAuth()
  const agentActing = actingOrg.id !== myOrg.id
  const [rows, setRows] = useState(null)
  const [sent, setSent] = useState({})       // a deal already exists with this listing
  const [invited, setInvited] = useState({}) // seller side: the buyer has already been invited
  const [err, setErr] = useState(null)
  const [showOut, setShowOut] = useState(false)
  useEffect(() => {
    const rpc = kind === 'offer' ? supabase.rpc('match_offer', { p_offer_id: listing.id }) : supabase.rpc('match_request', { p_request_id: listing.id })
    rpc.then(async ({ data, error }) => {
      if (error) setErr(error.message)
      const list = data ?? []
      if (kind === 'request' && list.length) {
        const { data: owners } = await supabase.from('offers').select('id, goods_owner, goods_owner_name, commission_pct, organisations(entity_type)').in('id', list.map((m) => m.offer_id))
        const byId = Object.fromEntries((owners ?? []).map((o) => [o.id, o]))
        setRows(list.map((m) => ({ ...m, owner: byId[m.offer_id] })))
      } else setRows(list)
    })
    supabase.from('interests').select('offer_id, request_id').eq(kind === 'offer' ? 'offer_id' : 'request_id', listing.id)
      .then(({ data }) => setSent(Object.fromEntries((data ?? []).map((i) => [kind === 'offer' ? i.request_id : i.offer_id, true]))))
    if (kind === 'offer') {
      supabase.from('deal_invitations').select('request_id').eq('offer_id', listing.id)
        .then(({ data }) => setInvited(Object.fromEntries((data ?? []).map((i) => [i.request_id, true]))))
    }
  }, [listing.id, kind])

  // Buyer side: make an offer to a matching seller. The deal starts as "proposed" and the seller replies.
  async function makeOffer(m) {
    setErr(null)
    let fee = null
    if (agentActing) {
      const { data } = await supabase.from('agent_profiles').select('typical_fee_note').eq('org_id', myOrg.id).maybeSingle()
      fee = data?.typical_fee_note ?? 'Fee to be agreed'
    }
    const base = { initiated_by: myOrg.id, match_score: m.score, ...(agentActing ? { agent_org_id: myOrg.id, agent_fee_note: fee } : {}) }
    const row = { ...base, offer_id: m.offer_id, request_id: listing.id }
    const { error } = await supabase.from('interests').insert(row)
    if (error) setErr(error.message); else setSent({ ...sent, [m.offer_id]: true })
  }

  // Seller side: invite a matching buyer to make an offer. The buyer gets a notification; no deal is created.
  async function invite(m) {
    setErr(null)
    const { error } = await supabase.rpc('invite_to_offer', { p_offer_id: listing.id, p_request_id: m.request_id })
    if (error) setErr(error.message); else setInvited({ ...invited, [m.request_id]: true })
  }

  if (!rows) return <p className="mt-4 text-sm text-navy/60">Matching…</p>
  const pass = rows.filter((m) => m.passed)
  const out = rows.filter((m) => !m.passed)
  // Count why candidates were left out (by the first check each one failed), without naming them
  const reasons = {}
  for (const m of out) { const c = (m.checks ?? []).find((x) => !x.passed); if (c) reasons[c.check] = (reasons[c.check] ?? 0) + 1 }
  const other = kind === 'offer' ? 'buyers' : 'sellers'

  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
      {err && <p className="text-sm text-red-700">{err}</p>}
      <p className="text-sm text-navy/70">
        <b>{pass.length}</b> of {rows.length} {other} with this commodity pass all checks{out.length > 0 && <>; {out.length} left out (
        {Object.entries(reasons).map(([k, n], i) => <span key={k}>{i ? ', ' : ''}{n} {k.toLowerCase().replace('ready in time', 'not ready in time').replace('allowed at destination', 'missing a required certificate').replace('enough quantity', 'too small').replace('right product', 'different grade').replace('safe to connect', 'not eligible')}</span>)})</>}.
      </p>
      {rows.length === 0 && <p className="text-sm text-navy/60">No open {kind === 'offer' ? 'purchase offers' : 'supply listings'} for this commodity yet.</p>}
      {pass.map((m) => {
        const otherId = kind === 'offer' ? m.request_id : m.offer_id
        return (
          <div key={otherId} className="grid gap-4 rounded-lg bg-cream p-4 md:grid-cols-[auto_14rem_1fr_auto]">
            <ScorePill score={m.score} />
            <div className="min-w-0">
              <div className="font-medium">{m.org_name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-navy/60">{m.org_country} <TierBadge tier={m.verification_tier} /> <DemoBadge show={m.is_demo} /></div>
              {m.owner?.organisations?.entity_type && <div className="mt-1 text-xs text-navy/60">{ENTITY_LABEL[m.owner.organisations.entity_type]}</div>}
              {m.owner?.goods_owner === 'producer' && <div className="mt-1 text-xs">Selling goods of <b>{m.owner.goods_owner_name}</b>{m.owner.commission_pct != null ? ` (${Number(m.owner.commission_pct)}% commission)` : ''}</div>}
              {m.est_arrival && <div className="mt-2 text-xs"><span className="text-navy/50">Est. arrival </span><b>{fmtDate(m.est_arrival)}</b></div>}
              <ul className="mt-2 space-y-0.5 text-xs text-leaf">{(m.checks ?? []).map((c) => <li key={c.check}>✓ {c.check}</li>)}</ul>
            </div>
            <ScoreFactors factors={m.factors} />
            <div className="flex flex-col gap-2">
              {kind === 'request'
                ? <button className="btn-primary" disabled={sent[otherId]} onClick={() => makeOffer(m)}>{sent[otherId] ? 'Offer sent' : 'Make offer'}</button>
                : sent[otherId]
                  ? <button className="btn-primary" disabled>Offer received</button>
                  : <button className="btn-primary" disabled={invited[otherId]} onClick={() => invite(m)}>{invited[otherId] ? 'Invitation sent' : 'Invite to make an offer'}</button>}
              <Link className="btn-ghost" to={`/report/${m.org_id}`}>Trust report</Link>
            </div>
          </div>
        )
      })}
      {out.length > 0 && (
        <div className="text-sm">
          <button className="text-navy/60 underline" onClick={() => setShowOut(!showOut)}>{showOut ? 'Hide' : 'Why were some left out?'}</button>
          {showOut && (
            <ul className="mt-2 space-y-1 text-xs text-navy/70">
              {out.map((m, i) => { const c = (m.checks ?? []).find((x) => !x.passed); return <li key={i}>✗ <b>{c?.check}:</b> {c?.detail}</li> })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_STYLE = {
  proposed: 'bg-amber-100 text-amber-800', accepted: 'bg-sky-100 text-sky-800', in_transit: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-emerald-100 text-emerald-800', completed: 'bg-leaf text-white', declined: 'bg-gray-100 text-navy/50', cancelled: 'bg-gray-100 text-navy/50',
}
const STATUS_LABEL = { proposed: 'Proposed', accepted: 'Accepted', in_transit: 'In transit', delivered: 'Delivered', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' }

// Deal pipeline: proposed (buyer's offer) → accepted (seller, optionally with terms) → in transit → delivered → completed, with ratings after delivery
function Interests({ kind, actingOrg }) {
  const org = actingOrg
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [rated, setRated] = useState({})
  const [rating, setRating] = useState(null)
  const [err, setErr] = useState(null)
  const [termsFor, setTermsFor] = useState(null) // deal id whose "accept with terms" box is open
  const [terms, setTerms] = useState('')
  const [cancelFor, setCancelFor] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const load = () => {
    supabase.from('interests')
      .select('*, cancelled_by_org:organisations!interests_cancelled_by_org_id_fkey(name), agent:organisations!interests_agent_org_id_fkey(name), officer:organisations!interests_network_officer_org_id_fkey(name), offers(id, grade, quantity_tonnes, org_id, organisations(id, name, safety_alert), commodities(name)), requests(id, grade, quantity_tonnes, org_id, organisations(id, name, safety_alert))')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []).filter((i) => isAdmin || i.offers?.org_id === org.id || i.requests?.org_id === org.id)))
    supabase.from('ratings').select('deal_id').eq('rater_org_id', org.id).then(({ data }) => setRated(Object.fromEntries((data ?? []).map((r) => [r.deal_id, true]))))
  }
  useEffect(() => { load() }, [org.id, isAdmin]) // eslint-disable-line
  const [reporting, setReporting] = useState(null)
  async function act(id, action, sellerTerms, reason) {
    setErr(null)
    const { error } = await supabase.rpc('advance_deal', { p_deal_id: id, p_action: action,
      ...(sellerTerms !== undefined ? { p_terms: sellerTerms } : {}), ...(reason !== undefined ? { p_reason: reason } : {}) })
    if (error) { setErr(error.message); load(); return false }
    load()
    return true
  }
  if (!rows.length) return null
  return (
    <div className="card">
      <h3 className="text-lg font-semibold">Deals</h3>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="py-1">Counterparty</th><th>Commodity</th><th>Score</th><th>Agent and fee</th><th>Est. arrival</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((i) => {
              const amSeller = i.offers?.org_id === org.id
              const amBuyer = i.requests?.org_id === org.id
              const other = amSeller ? i.requests?.organisations : i.offers?.organisations
              // Buyer-first deals are answered by the seller; older deals are answered by whoever did not propose them
              const incoming = i.proposed_by_side
                ? (i.proposed_by_side === 'buyer' ? amSeller : !amSeller)
                : i.initiated_by !== org.id && i.agent_org_id !== org.id
              const legacyProposal = i.status === 'proposed' && !i.proposed_by_side
              const canWithdraw = i.status === 'proposed' && !legacyProposal && (amBuyer || isAdmin)
              const canLegacyCancel = legacyProposal && (amBuyer || amSeller || isAdmin)
              const needsCancelReason = i.status === 'accepted' || isAdmin
              const canCancelAccepted = i.status === 'accepted' && (amBuyer || amSeller || isAdmin)
              const cancelledBy = i.cancelled_by_org?.name ?? (i.cancelled_by_org_id ? (i.cancelled_by_org_id === org.id ? org.name : other?.name) : 'OXL staff')
              return (
                <Fragment key={i.id}>
                  <tr className="border-t border-line align-top">
                    <td className="py-2">{other?.name} <SafetyBadge alert={other?.safety_alert} /> {i.status === 'proposed' && incoming && <span className="ml-1 text-xs text-terra">{amSeller ? 'purchase offer: needs your reply' : 'needs your reply'}</span>}</td>
                    <td>{i.offers?.commodities?.name}</td>
                    <td className="tabular-nums">{i.match_score ?? '—'}</td>
                    <td className="text-xs">{i.agent ? <>{i.agent.name}<br /><span className="text-navy/60">{i.agent_fee_note}</span>
                      {i.officer && <><br /><span className="text-navy/60">Field officer: {i.officer.name}{i.officer_share_note ? ` (${i.officer_share_note})` : ''}</span></>}</>: '—'}</td>
                    <td className="text-xs">{fmtDate(i.estimated_arrival) ?? '—'}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[i.status]}`}>{STATUS_LABEL[i.status] ?? i.status}</span>
                      {i.seller_terms && <div className="mt-1 max-w-[14rem] text-xs text-navy/60">Seller’s terms: {i.seller_terms}</div>}
                      {i.status === 'cancelled' && <div className="mt-1 max-w-[20rem] whitespace-normal text-xs text-navy/70">Cancelled by {cancelledBy}{i.cancel_reason ? `: ${i.cancel_reason}` : ': no reason provided'}</div>}
                    </td>
                    <td className="space-x-2 whitespace-nowrap text-right">
                      {i.status === 'proposed' && incoming && (amSeller || amBuyer) && <>
                        <button className="text-leaf" onClick={() => act(i.id, 'accept')}>Accept</button>
                        {amSeller && <button className="text-leaf" onClick={() => { setTermsFor(termsFor === i.id ? null : i.id); setTerms('') }}>Accept with terms</button>}
                        <button className="text-navy/50" onClick={() => act(i.id, 'decline')}>Decline</button></>}
                      {i.status === 'accepted' && amSeller && <button className="text-leaf" onClick={() => act(i.id, 'ship')}>Mark shipped</button>}
                      {i.status === 'in_transit' && !amSeller && <button className="text-leaf" onClick={() => act(i.id, 'confirm_delivery')}>Confirm delivery</button>}
                      {i.status === 'delivered' && amSeller && !i.seller_confirmed_delivery_at && <button className="text-leaf" onClick={() => act(i.id, 'confirm_delivery')}>Confirm delivery</button>}
                      {['delivered', 'completed'].includes(i.status) && !rated[i.id] && <button className="text-terra" onClick={() => setRating({ deal: i, rated: other })}>Rate {amSeller ? 'buyer' : 'seller'}</button>}
                      {(canWithdraw || canLegacyCancel || canCancelAccepted) && <button className="text-navy/50" onClick={() => {
                        if (!needsCancelReason) act(i.id, 'cancel')
                        else { setCancelFor(cancelFor === i.id ? null : i.id); setCancelReason('') }
                      }}>{canWithdraw && !isAdmin ? 'Withdraw' : canLegacyCancel && !isAdmin ? 'Cancel' : 'Cancel deal'}</button>}
                      <button className="text-red-700/70" onClick={() => setReporting({ org: other, deal: i.id })}>Report</button>
                    </td>
                  </tr>
                  {termsFor === i.id && (
                    <tr className="bg-cream">
                      <td colSpan={7} className="px-3 py-3">
                        <label className="label">Your terms (price adjustments, payment, packing, inspection…)</label>
                        <div className="flex flex-wrap gap-2">
                          <input className="input max-w-xl flex-1" value={terms} onChange={(e) => setTerms(e.target.value)}
                            placeholder="e.g. 30% advance, balance against bill of lading; inspection at Mombasa" />
                          <button className="btn-primary" disabled={!terms.trim()} onClick={() => { act(i.id, 'accept', terms.trim()); setTermsFor(null); setTerms('') }}>Accept with these terms</button>
                          <button className="btn-ghost" onClick={() => { setTermsFor(null); setTerms('') }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {cancelFor === i.id && needsCancelReason && (
                    <tr className="bg-cream">
                      <td colSpan={7} className="px-3 py-3">
                        <label className="label" htmlFor={`cancel-reason-${i.id}`}>Cancellation reason (5–500 characters)</label>
                        <textarea id={`cancel-reason-${i.id}`} className="input min-h-20" maxLength={500} value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)} placeholder="Explain why this deal is being cancelled" />
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <button className="btn-primary" disabled={cancelReason.trim().length < 5}
                            onClick={async () => { if (await act(i.id, 'cancel', undefined, cancelReason.trim())) { setCancelFor(null); setCancelReason('') } }}>Confirm cancellation</button>
                          <button className="btn-ghost" onClick={() => { setCancelFor(null); setCancelReason('') }}>Keep deal</button>
                          <span className="text-xs text-navy/50">{cancelReason.length}/500</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {reporting && <ReportProblem reporterOrgId={org.id} reported={reporting.org} interestId={reporting.deal} onClose={() => setReporting(null)} />}
      {rating && <RatingForm org={org} {...rating} onDone={() => { setRating(null); load() }} />}
    </div>
  )
}

function RatingForm({ org, deal, rated, onDone }) {
  const [f, setF] = useState({ on_time: true, quality: true, stars: 5, comment: '' })
  const [err, setErr] = useState(null)
  async function save(e) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.from('ratings').insert({ deal_id: deal.id, rater_org_id: org.id, rated_org_id: rated.id,
      on_time: f.on_time, quality_as_described: f.quality, stars: Number(f.stars), comment: f.comment || null })
    if (error) setErr(error.message); else onDone()
  }
  return (
    <form onSubmit={save} className="mt-4 grid gap-3 rounded-lg bg-cream p-4 sm:grid-cols-4">
      <p className="sm:col-span-4 font-medium">Rate {rated?.name}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.on_time} onChange={(e) => setF({ ...f, on_time: e.target.checked })} /> Delivered on time</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.quality} onChange={(e) => setF({ ...f, quality: e.target.checked })} /> As described</label>
      <div><label className="label">Overall</label><select className="input" value={f.stars} onChange={(e) => setF({ ...f, stars: e.target.value })}>{[5, 4, 3, 2, 1].map((n) =><option key={n} value={n}>{'★'.repeat(n)}</option>)}</select></div>
      <div className="sm:col-span-4"><label className="label">Comment (optional)</label><input className="input" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></div>
      {err && <p className="sm:col-span-4 text-sm text-red-700">{err}</p>}
      <div className="sm:col-span-4 flex gap-2"><button className="btn-primary">Save rating</button><button type="button" className="btn-ghost" onClick={onDone}>Cancel</button></div>
    </form>
  )
}
