// Business activity: pick a general sector (ISIC division) or one specific activity (ISIC class). A-Z with search.
// Richmond, 13 Nov 2026: activity picked from a list, country classification first when one is loaded.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

const isOther = (r) => r.scheme === 'OXL' && r.code === 'OTHER'
const level = (r) => (r.country || isOther(r) ? 'both' : /^\d{2}$/.test(r.code) ? 'broad' : /^\d{4}$/.test(r.code) ? 'specific' : 'none')

export default function BusinessCategorySelect({ country, value, onChange, required, id }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('broad')
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

  const current = rows.find((r) => r.id === value)
  const options = useMemo(() => {
    const list = rows.filter((r) => { const l = level(r); return l === 'both' || l === mode })
    const s = q.trim().toLowerCase()
    const found = s ? list.filter((r) => r.name.toLowerCase().includes(s) || r.code === s) : list
    return found.sort((a, b) => (isOther(a) - isOther(b)) || a.name.localeCompare(b.name))
  }, [rows, mode, q])

  const pick = (r) => { onChange(r.id); setOpen(false); setQ('') }
  const tab = (m, label) => (
    <button type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === m ? 'bg-navy text-white' : 'bg-cream text-navy/70'}`}>{label}</button>
  )

  return (
    <div className="relative" ref={box}>
      <button type="button" id={id} className="input flex w-full items-center gap-2 text-left" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`flex-1 truncate ${current ? '' : 'text-navy/50'}`}>{current ? current.name : 'Choose your main activity…'}</span>
        <span className="text-xs text-navy/50">▾</span>
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" required value={value ?? ''} onChange={() => {}} className="pointer-events-none absolute inset-x-0 bottom-0 h-0 opacity-0" />}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-white shadow-lg">
          <div className="flex gap-2 p-2 pb-0">{tab('broad', 'General sector')}{tab('specific', 'Specific activity')}</div>
          <p className="px-3 pt-2 text-xs text-navy/60">{mode === 'broad' ? 'Choose this if you work across the whole sector.' : 'Choose this if you do one precise activity only.'}</p>
          <input autoFocus className="input m-2 w-[calc(100%-1rem)]" placeholder="Search, e.g. cocoa, gas, transport…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') { e.preventDefault(); if (q.trim() && options[0]) pick(options[0]) } }} />
          <ul role="listbox" className="max-h-72 overflow-y-auto pb-1">
            {options.map((r) => (
              <li key={r.id} role="option" aria-selected={r.id === value}>
                <button type="button" onClick={() => pick(r)} className={`block w-full px-3 py-2 text-left text-sm hover:bg-cream ${r.id === value ? 'bg-cream font-medium' : ''}`}>
                  {r.name}
                  {!isOther(r) && <span className="ml-2 text-xs text-navy/40">{r.code}</span>}
                </button>
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-2 text-sm text-navy/60">Nothing found. Choose “Other” and describe it below.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
