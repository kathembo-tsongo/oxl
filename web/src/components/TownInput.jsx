import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

const cache = new Map() // country code -> sorted list of town names

async function loadTowns(code) {
  if (cache.has(code)) return cache.get(code)
  const names = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('locations').select('name').eq('country', code).order('name').range(from, from + 999)
    if (error || !data) break
    data.forEach((r) => names.add(r.name))
    if (data.length < 1000) break
  }
  const list = [...names].sort((a, b) => a.localeCompare(b))
  cache.set(code, list)
  return list
}

// Town box: suggests the towns of the chosen country as you type, but any text can still be typed.
export default function TownInput({ id, country, value, onChange }) {
  const [towns, setTowns] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    let live = true
    setTowns([])
    if (country) loadTowns(country).then((l) => { if (live) setTowns(l) })
    return () => { live = false }
  }, [country])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [open])

  const matches = useMemo(() => {
    const s = (value || '').trim().toLowerCase()
    if (!s) return towns.slice(0, 50)
    const starts = towns.filter((t) => t.toLowerCase().startsWith(s))
    const has = towns.filter((t) => !t.toLowerCase().startsWith(s) && t.toLowerCase().includes(s))
    return [...starts, ...has].slice(0, 50)
  }, [towns, value])

  const exact = matches.some((t) => t.toLowerCase() === (value || '').trim().toLowerCase())

  return (
    <div className="relative" ref={box}>
      <input id={id} className="input" autoComplete="off" value={value} placeholder={towns.length ? 'Start typing or pick a town' : 'Type your town'}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }} />
      {open && matches.length > 0 && !(exact && matches.length === 1) && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {matches.map((t) => (
            <li key={t} role="option">
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-cream" onClick={() => { onChange(t); setOpen(false) }}>{t}</button>
            </li>
          ))}
        </ul>
      )}
      {towns.length > 0 && <p className="mt-1 text-xs text-navy/50">Not in the list? Just type your town.</p>}
    </div>
  )
}
