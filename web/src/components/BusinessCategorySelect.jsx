// Business activity picked from one A-Z list with search (Richmond, 13 Nov 2026).
// Shows the country's own classification (if OXL staff loaded one) and the UN ISIC list together.
// Section headings that have activities under them are hidden; only activities can be picked.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

const isOther = (r) => r.scheme === 'OXL' && r.code === 'OTHER'

export default function BusinessCategorySelect({ country, value, onChange, required, id }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef(null)

  useEffect(() => {
    let query = supabase.from('business_categories').select('id, country, scheme, code, name, parent_code').eq('is_active', true)
    query = country ? query.or(`country.is.null,country.eq.${country}`) : query.is('country', null)
    query.order('name').then(({ data }) => setRows(data ?? []))
  }, [country])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [open])

  const options = useMemo(() => {
    const parents = new Set(rows.filter((r) => r.parent_code).map((r) => `${r.scheme}|${r.country ?? ''}|${r.parent_code}`))
    const pickable = rows.filter((r) => r.parent_code || !parents.has(`${r.scheme}|${r.country ?? ''}|${r.code}`))
    return pickable.sort((a, b) => (isOther(a) - isOther(b)) || a.name.localeCompare(b.name))
  }, [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options
    return options.filter((r) => r.name.toLowerCase().includes(s) || r.code.toLowerCase() === s)
  }, [options, q])

  const current = rows.find((r) => r.id === value)
  const pick = (r) => { onChange(r.id); setOpen(false); setQ('') }

  return (
    <div className="relative" ref={box}>
      <button type="button" id={id} className="input flex w-full items-center gap-2 text-left" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`flex-1 truncate ${current ? '' : 'text-navy/50'}`}>{current ? current.name : 'Choose your main activity…'}</span>
        <span className="text-xs text-navy/50">▾</span>
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" required value={value ?? ''} onChange={() => {}} className="pointer-events-none absolute inset-x-0 bottom-0 h-0 opacity-0" />}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-white shadow-lg">
          <input autoFocus className="input m-2 w-[calc(100%-1rem)]" placeholder="Search, e.g. cocoa, textile, transport…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') { e.preventDefault(); if (q.trim() && shown[0]) pick(shown[0]) } }} />
          <ul role="listbox" className="max-h-72 overflow-y-auto pb-1">
            {shown.map((r) => (
              <li key={r.id} role="option" aria-selected={r.id === value}>
                <button type="button" onClick={() => pick(r)} className={`block w-full px-3 py-2 text-left text-sm hover:bg-cream ${r.id === value ? 'bg-cream font-medium' : ''}`}>
                  {r.name}
                  {!isOther(r) && <span className="ml-2 text-xs text-navy/40">{r.scheme}{r.country ? ` ${r.country}` : ''} {r.code}</span>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-navy/60">Nothing found. Choose “Other” and describe it below.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
