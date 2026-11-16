// Business location (Richmond, 13 Nov 2026): the business, its agent or field officer pins where it
// works; OXL checks it automatically against the declared town and country, then OXL staff confirm it.
// Only the business, its agent, its field officer and OXL staff see the coordinates.
import { useEffect, useState } from 'react'
import { supabase, GEO_LABEL, GEO_STYLE, mapsLink, earthLink } from '../supabase'
import LocationMap from './LocationMap'

export function GeoBadge({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GEO_STYLE[status ?? 'none']}`}>{GEO_LABEL[status ?? 'none']}</span>
}

export function GeoLinks({ lat, lon }) {
  if (lat == null) return null
  return (
    <span className="space-x-3 text-xs">
      <a className="text-terra" href={mapsLink(lat, lon)} target="_blank" rel="noreferrer">Open in Google Maps</a>
      <a className="text-terra" href={earthLink(lat, lon)} target="_blank" rel="noreferrer">Open in Google Earth</a>
    </span>
  )
}

export function GeoFlags({ check }) {
  const flags = check?.flags ?? []
  if (!check) return null
  return (
    <div className="text-xs text-navy/70">
      {check.declared_town && <div>{check.declared_town_km} km from the declared town {check.declared_town}.</div>}
      {!check.declared_town && check.nearest_place && <div>Nearest known place: {check.nearest_place} ({check.nearest_country}), {check.nearest_km} km.</div>}
      {flags.map((f) => <div key={f} className="text-amber-800">⚑ {f}</div>)}
      {check.review_note && <div>OXL note: {check.review_note}</div>}
    </div>
  )
}

export default function LocationCard({ org, onSaved }) {
  const [saved, setSaved] = useState(undefined)   // row from org_locations, null when not pinned
  const [draft, setDraft] = useState(null)         // { lat, lon, accuracy, source } not yet saved
  const [status, setStatus] = useState(org.geo_status)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = () => supabase.from('org_locations').select('*').eq('org_id', org.id).maybeSingle().then(({ data }) => setSaved(data ?? null))
  useEffect(() => { load(); setStatus(org.geo_status) }, [org.id]) // eslint-disable-line

  function useDevice() {
    setMsg(null)
    if (!navigator.geolocation) { setMsg({ err: 'This browser cannot share its location. Click the map instead.' }); return }
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft({ lat: Number(p.coords.latitude.toFixed(6)), lon: Number(p.coords.longitude.toFixed(6)), accuracy: Math.round(p.coords.accuracy), source: 'device' }),
      (e) => setMsg({ err: e.code === 1 ? 'Location permission was refused. Allow it in the browser, or click the map instead.' : 'Could not get your position. Click the map instead.' }),
      { enableHighAccuracy: true, timeout: 15000 })
  }
  async function save(remove = false) {
    setBusy(true); setMsg(null)
    const p = remove ? { p_lat: null, p_lon: null, p_accuracy_m: null, p_source: null }
      : { p_lat: draft.lat, p_lon: draft.lon, p_accuracy_m: draft.accuracy ?? null, p_source: draft.source }
    const { data, error } = await supabase.rpc('set_org_location', { p_org: org.id, ...p })
    setBusy(false)
    if (error) { setMsg({ err: error.message }); return }
    setDraft(null); setStatus(data.status); load(); onSaved?.()
    setMsg({ ok: remove ? 'Pin removed.' : data.status === 'auto_ok' ? 'Location saved. The automatic check passed; OXL staff will confirm it.' : 'Location saved. The automatic check found something to look at (below); OXL staff will review it.' })
  }

  if (saved === undefined) return null
  const shown = draft ?? (saved ? { lat: Number(saved.lat), lon: Number(saved.lon), accuracy: saved.accuracy_m } : null)
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold">Business location</h3>
          <p className="text-sm text-navy/60">Pin where the business works: farm, store, warehouse or office. Buyers and lenders see only whether OXL has confirmed it, never the exact spot.</p></div>
        <GeoBadge status={draft ? 'none' : status} />
      </div>
      <LocationMap lat={shown?.lat} lon={shown?.lon} accuracy={shown?.accuracy} onPick={(lat, lon) => setDraft({ lat, lon, accuracy: null, source: 'map' })} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={useDevice}>Use my current position</button>
        <span className="text-xs text-navy/50">or click the map (switch to Satellite to see buildings)</span>
        {shown && <span className="ml-auto"><GeoLinks lat={shown.lat} lon={shown.lon} /></span>}
      </div>
      {draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-cream p-3 text-sm">
          <span className="flex-1">New pin: {draft.lat}, {draft.lon}{draft.accuracy ? ` (±${draft.accuracy} m)` : ''}</span>
          <button className="btn-primary" disabled={busy} onClick={() => save(false)}>Save location</button>
          <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
        </div>
      )}
      {!draft && saved && <GeoFlags check={{ ...(saved.auto_check ?? {}), review_note: saved.review_note }} />}
      {!draft && saved && <button className="text-xs text-navy/50 hover:text-red-700" onClick={() => save(true)}>Remove pin</button>}
      {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
    </section>
  )
}
