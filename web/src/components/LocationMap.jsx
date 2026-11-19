// Map with one pin (OpenStreetMap, with a satellite layer). Click to move the pin when onPick is given.
// center: where to open the map when there is no pin yet, { lat, lon, zoom } (the business's own town or country)
// focus:  { lat, lon, zoom, key } move the view there whenever key changes (search result, town button, device position)
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function LocationMap({ lat, lon, accuracy, onPick, center, focus, height = 260 }) {
  const box = useRef(null)
  const map = useRef(null)
  const pin = useRef(null)
  const ring = useRef(null)
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    const start = lat != null ? { view: [lat, lon], zoom: 15 } : center ? { view: [center.lat, center.lon], zoom: center.zoom ?? 6 } : { view: [2, 20], zoom: 3 }
    const m = L.map(box.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView(start.view, start.zoom)
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' })
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' })
    streets.addTo(m)
    L.control.layers({ Map: streets, Satellite: satellite }, {}, { position: 'topright' }).addTo(m)
    m.on('click', (e) => pick.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))))
    map.current = m
    return () => { m.remove(); map.current = null; pin.current = null; ring.current = null }
  }, []) // eslint-disable-line

  // The business's town or country loads after the map is created: move there while there is still no pin
  useEffect(() => {
    const m = map.current
    if (!m || lat != null || !center) return
    m.setView([center.lat, center.lon], center.zoom ?? 6)
  }, [center?.lat, center?.lon, center?.zoom]) // eslint-disable-line

  // Move the view on request (search result, "start from my town", device position)
  useEffect(() => {
    const m = map.current
    if (!m || !focus) return
    m.setView([focus.lat, focus.lon], focus.zoom ?? 15)
  }, [focus?.key]) // eslint-disable-line

  useEffect(() => {
    const m = map.current
    if (!m) return
    pin.current?.remove(); ring.current?.remove(); pin.current = null; ring.current = null
    if (lat == null || lon == null) return
    if (accuracy && accuracy > 20) ring.current = L.circle([lat, lon], { radius: accuracy, color: '#1C2B4A', weight: 1, fillOpacity: 0.08 }).addTo(m)
    pin.current = L.circleMarker([lat, lon], { radius: 9, color: '#ffffff', weight: 2, fillColor: '#A3472A', fillOpacity: 1 }).addTo(m)
    if (!m.getBounds().contains([lat, lon])) m.setView([lat, lon], Math.max(m.getZoom(), 14))
  }, [lat, lon, accuracy])

  return <div ref={box} style={{ height }} className={`z-0 w-full overflow-hidden rounded-lg border border-line ${onPick ? 'cursor-crosshair' : ''}`} />
}
