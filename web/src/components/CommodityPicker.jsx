import { useEffect, useMemo, useRef, useState } from 'react'

// Search and tick any number of products. Selected ones show as chips.
export default function CommodityPicker({ commodities, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [open])

  const sorted = useMemo(() => [...commodities].sort((a, b) => a.name.localeCompare(b.name)), [commodities])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? sorted.filter((c) => c.name.toLowerCase().includes(s) || c.hs_code.startsWith(s)) : sorted
  }, [sorted, q])
  const chosen = sorted.filter((c) => value.includes(c.hs_code))
  const toggle = (code) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code])

  return (
    <div className="relative" ref={box}>
      {chosen.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {chosen.map((c) => (
            <button type="button" key={c.hs_code} onClick={() => toggle(c.hs_code)} className="rounded-full border border-leaf bg-leaf px-3 py-1 text-xs text-white">
              {c.name} <span className="opacity-70">HS {c.hs_code}</span> <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <input className="input" placeholder="Search products, e.g. ginger, cocoa, copper…" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') e.preventDefault() }} />
      {open && (
        <ul role="listbox" aria-multiselectable="true" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {shown.map((c) => {
            const on = value.includes(c.hs_code)
            return (
              <li key={c.hs_code} role="option" aria-selected={on}>
                <button type="button" onClick={() => toggle(c.hs_code)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cream ${on ? 'bg-cream font-medium' : ''}`}>
                  <span className="w-4">{on ? '✓' : ''}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-navy/40">HS {c.hs_code}</span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-navy/60">No product found.</li>}
        </ul>
      )}
    </div>
  )
}
