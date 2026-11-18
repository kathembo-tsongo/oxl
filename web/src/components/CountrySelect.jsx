import { useEffect, useMemo, useRef, useState } from 'react'

export const flagUrl = (code) => `https://flagcdn.com/w40/${String(code).toLowerCase()}.png`

export function Flag({ code, className = '' }) {
  if (!code) return null
  return <img src={flagUrl(code)} alt="" loading="lazy" width="20" height="14" className={`inline-block h-3.5 w-5 rounded-[2px] object-cover ring-1 ring-black/10 ${className}`} />
}

// Country picker with flags and search. `countries` = rows from the countries table.
export default function CountrySelect({ id, value, onChange, countries }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef(null)
  const current = countries.find((c) => c.code === value)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [open])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? countries.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s) : countries
  }, [countries, q])

  const pick = (c) => { onChange(c.code); setOpen(false); setQ('') }

  return (
    <div className="relative" ref={box}>
      <button type="button" id={id} className="input flex w-full items-center gap-2 text-left" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {current ? <><Flag code={current.code} /><span className="flex-1 truncate">{current.name}</span></> : <span className="flex-1 text-navy/50">Choose a country…</span>}
        <span className="text-xs text-navy/50">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-white shadow-lg">
          <input autoFocus className="input m-2 w-[calc(100%-1rem)]" placeholder="Search countries…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') { e.preventDefault(); if (list[0]) pick(list[0]) } }} />
          <ul role="listbox" className="max-h-64 overflow-y-auto pb-1">
            {list.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === value}>
                <button type="button" onClick={() => pick(c)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cream ${c.code === value ? 'bg-cream font-medium' : ''}`}>
                  <Flag code={c.code} /><span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-2 text-sm text-navy/60">No country found</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
