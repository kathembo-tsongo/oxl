import { useEffect, useMemo, useRef, useState } from 'react'
import { Flag } from './CountrySelect'

// International dial codes of the 54 African countries.
export const DIAL = {
  DZ: '213', AO: '244', BJ: '229', BW: '267', BF: '226', BI: '257', CV: '238', CM: '237', CF: '236', TD: '235', KM: '269', CG: '242', CD: '243',
  CI: '225', DJ: '253', EG: '20', GQ: '240', ER: '291', SZ: '268', ET: '251', GA: '241', GM: '220', GH: '233', GN: '224', GW: '245', KE: '254',
  LS: '266', LR: '231', LY: '218', MG: '261', MW: '265', ML: '223', MR: '222', MU: '230', MA: '212', MZ: '258', NA: '264', NE: '227', NG: '234',
  RW: '250', ST: '239', SN: '221', SC: '248', SL: '232', SO: '252', ZA: '27', SS: '211', SD: '249', TZ: '255', TG: '228', TN: '216', UG: '256',
  ZM: '260', ZW: '263',
}
const BY_LENGTH = Object.entries(DIAL).sort((a, b) => b[1].length - a[1].length)

// Phone number with a flag and dial code. `country` sets the default code; `onChange` receives e.g. "+233241234567" (or "").
export default function PhoneInput({ id, country, countries = [], value, onChange }) {
  const [dc, setDc] = useState(DIAL[country] ? country : 'KE')
  const [touched, setTouched] = useState(false)
  const [num, setNum] = useState('')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef(null)

  useEffect(() => { if (!touched && DIAL[country]) setDc(country) }, [country, touched])

  useEffect(() => {
    const full = num ? `+${DIAL[dc]}${num}` : ''
    if (full !== (value ?? '')) onChange(full)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dc, num])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [open])

  const names = useMemo(() => Object.fromEntries(countries.map((c) => [c.code, c.name])), [countries])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^\+/, '')
    return Object.keys(DIAL)
      .map((code) => ({ code, name: names[code] ?? code, dial: DIAL[code] }))
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.dial.startsWith(s))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [names, q])

  function typed(raw) {
    const t = raw.trim()
    if (t.startsWith('+')) {
      const digits = t.replace(/\D/g, '')
      const hit = BY_LENGTH.find(([, d]) => digits.startsWith(d))
      if (hit) { setDc(hit[0]); setTouched(true); setNum(digits.slice(hit[1].length).replace(/^0+/, '')); return }
    }
    setNum(t.replace(/\D/g, '').replace(/^0+/, ''))
  }

  return (
    <div className="relative" ref={box}>
      <div className="flex gap-2">
        <button type="button" className="input flex w-[7.5rem] shrink-0 items-center gap-1.5 text-left" aria-label="Country dial code" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Flag code={dc} /><span className="flex-1 text-sm">+{DIAL[dc]}</span><span className="text-xs text-navy/50">▾</span>
        </button>
        <input id={id} className="input min-w-0 flex-1" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="e.g. 24 123 4567"
          value={num} onChange={(e) => typed(e.target.value)} />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-72 max-w-full rounded-lg border border-line bg-white shadow-lg">
          <input autoFocus className="input m-2 w-[calc(100%-1rem)]" placeholder="Search country or code…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') e.preventDefault() }} />
          <ul className="max-h-64 overflow-y-auto pb-1">
            {list.map((c) => (
              <li key={c.code}>
                <button type="button" onClick={() => { setDc(c.code); setTouched(true); setOpen(false); setQ('') }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cream ${c.code === dc ? 'bg-cream font-medium' : ''}`}>
                  <Flag code={c.code} /><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-navy/50">+{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {num && <p className="mt-1 text-xs text-navy/50">Saved as +{DIAL[dc]}{num}</p>}
    </div>
  )
}
