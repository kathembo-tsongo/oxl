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

// Usual length of the number after the dial code, without the leading 0. Kenya and Ghana are exact;
// other countries allow the range their numbering plans use. Anything not listed allows 7 to 11 digits.
const LEN = {
  KE: [9, 9], GH: [9, 9], NG: [8, 10], UG: [9, 9], TZ: [9, 9], RW: [9, 9], ET: [9, 9], ZA: [9, 9], EG: [8, 10], MA: [9, 9], DZ: [8, 9],
  TN: [8, 8], SN: [9, 9], CI: [8, 10], CM: [8, 9], ZM: [9, 9], ZW: [7, 10], MZ: [8, 9], MW: [7, 9], BW: [7, 8], NA: [7, 9], AO: [9, 9],
  SD: [9, 9], SS: [9, 9], BF: [8, 8], ML: [8, 8], NE: [8, 8], TG: [8, 8], BJ: [8, 10], DJ: [8, 8], GA: [7, 9], CG: [9, 9], CD: [9, 9],
  TD: [8, 8], CF: [8, 8], GQ: [9, 9], ER: [7, 7], SZ: [8, 8], LS: [8, 8], MG: [9, 9], MU: [7, 8], MR: [8, 8], GM: [7, 7], GN: [8, 9],
  SL: [8, 8], BI: [8, 8], SO: [7, 9], LY: [9, 9],
}
const range = (code) => LEN[code] ?? [7, 11]

// True when "+<dial code><number>" has a real dial code and the right number of digits for that country.
export function phoneIsValid(full) {
  if (!full || !/^\+\d+$/.test(full)) return false
  const digits = full.slice(1)
  const hit = BY_LENGTH.find(([, d]) => digits.startsWith(d))
  if (!hit) return false
  const n = digits.length - hit[1].length
  const [lo, hi] = range(hit[0])
  return n >= lo && n <= hi
}

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

  const [lo, hi] = range(dc)
  const valid = num.length >= lo && num.length <= hi
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
      if (hit) { setDc(hit[0]); setTouched(true); setNum(digits.slice(hit[1].length).replace(/^0+/, '').slice(0, range(hit[0])[1])); return }
    }
    // Letters and symbols are dropped, a leading 0 is removed, and the number stops at the longest length for this country
    setNum(t.replace(/\D/g, '').replace(/^0+/, '').slice(0, range(dc)[1]))
  }

  return (
    <div className="relative" ref={box}>
      <div className="flex gap-2">
        <button type="button" className="input flex w-[7.5rem] shrink-0 items-center gap-1.5 text-left" aria-label="Country dial code" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Flag code={dc} /><span className="flex-1 text-sm">+{DIAL[dc]}</span><span className="text-xs text-navy/50">▾</span>
        </button>
        <input id={id} className="input min-w-0 flex-1" type="tel" inputMode="numeric" autoComplete="tel-national" aria-invalid={num ? !valid : undefined} placeholder="e.g. 24 123 4567"
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
      {num && (valid
        ? <p className="mt-1 text-xs text-leaf">Saved as +{DIAL[dc]}{num}</p>
        : <p className="mt-1 text-xs text-terra" role="alert">{names[dc] ?? dc} numbers have {lo === hi ? `${lo} digits` : `${lo} to ${hi} digits`} after +{DIAL[dc]}{num.length < lo ? ` (you have ${num.length})` : ''}.</p>)}
    </div>
  )
}
