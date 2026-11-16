// Business activity picked from a list (Richmond, 13 Nov 2026). The country's own classification
// (loaded by OXL staff under Reference data) comes first; the UN ISIC list is always available.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function BusinessCategorySelect({ country, value, onChange, required, id }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    let q = supabase.from('business_categories').select('id, country, scheme, code, name, parent_code').eq('is_active', true)
    q = country ? q.or(`country.is.null,country.eq.${country}`) : q.is('country', null)
    q.order('scheme').order('code').then(({ data }) => setRows(data ?? []))
  }, [country])

  // Group by classification, the country's own list first
  const groups = {}
  for (const r of rows) (groups[`${r.country ? '0' : '1'}|${r.scheme}${r.country ? ` (${r.country})` : ''}`] ??= []).push(r)
  // Each section followed by its divisions (e.g. A, 01, 02, 03, B, C, 10…)
  const key = (r) => (r.parent_code ? `${r.parent_code}|1|${r.code}` : `${r.code}|0`)
  for (const g of Object.values(groups)) g.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }))
  return (
    <select id={id} className="input" required={required} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose your main activity…</option>
      {Object.keys(groups).sort().map((g) => (
        <optgroup key={g} label={g.split('|')[1]}>
          {groups[g].map((r) => <option key={r.id} value={r.id}>{r.parent_code ? '   ' : ''}{r.code} · {r.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
