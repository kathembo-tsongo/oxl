// Picks a town, port, border post or airport, optionally limited to one country
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const KIND = { town: 'town', port: 'port', border: 'border', airport: 'airport' }
let cache = null

export default function LocationSelect({ country, value, onChange, placeholder = 'Choose a town or port…' }) {
  const [locs, setLocs] = useState(cache ?? [])
  useEffect(() => {
    if (cache) return
    supabase.from('locations').select('*').order('country').order('name').then(({ data }) => { cache = data ?? []; setLocs(cache) })
  }, [])
  const list = country ? locs.filter((l) => l.country === country) : locs
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {list.map((l) => <option key={l.id} value={l.id}>{l.name} ({KIND[l.kind]}{country ? '' : `, ${l.country}`})</option>)}
    </select>
  )
}
