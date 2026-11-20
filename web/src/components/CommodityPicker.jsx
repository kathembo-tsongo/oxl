import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

// Search and tick any number of products. Selected ones show as chips.
// If the product is missing, the user can ask OXL to add it.
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
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-navy/60">No product found. Use "Can't find your product?" below to ask OXL to add it.</li>}
        </ul>
      )}
      <RequestProduct suggested={q} onOpen={() => setOpen(false)} />
    </div>
  )
}

function RequestProduct({ suggested, onOpen }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [touched, setTouched] = useState(false)
  // Until the person types their own name, follow what they typed in the search box
  useEffect(() => { if (show && !touched) setName(suggested.trim()) }, [suggested, show, touched])

  async function send() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('submit_product_request', { p_name: name, p_note: note || null })
    setBusy(false)
    if (error) { setMsg({ err: error.message }); return }
    setMsg({ ok: 'Sent. OXL staff will add it and tell you. For now, pick the closest product and describe yours in your profile.' })
    setName(''); setNote(''); setShow(false)
  }

  return (
    <div className="mt-2 text-sm">
      {msg?.ok && <p className="rounded-lg bg-leaf/10 px-3 py-2 text-leaf">{msg.ok}</p>}
      {!show ? (
        <button type="button" className="text-terra hover:underline" onClick={() => { setTouched(false); setShow(true); setMsg(null); onOpen?.() }}>Can't find your product? Ask OXL to add it</button>
      ) : (
        <div className="space-y-2 rounded-lg border border-line bg-white p-3" onFocus={() => onOpen?.()}>
          <div><label className="label" htmlFor="rp-name">Product name</label>
            <input id="rp-name" className="input" value={name} maxLength={120} onChange={(e) => { setTouched(true); setName(e.target.value) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name.trim().length >= 2 && !busy) send() } }} placeholder="e.g. Cashew kernels" /></div>
          <div><label className="label" htmlFor="rp-note">Anything that helps us (optional)</label>
            <input id="rp-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. grade, form, how you sell it" /></div>
          {msg?.err && <p className="text-red-700">{msg.err}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={busy || name.trim().length < 2} onClick={send}>{busy ? 'Sending…' : 'Send request'}</button>
            <button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
