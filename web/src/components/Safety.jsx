// Safety (Richmond, 13 Nov 2026): users report problems; OXL reviews automatic signals and reports and can
// place a safety alert, which every business in an open deal with that party is told about at once.
import { useState } from 'react'
import { supabase } from '../supabase'

export function SafetyBadge({ alert }) {
  if (!alert) return null
  return alert === 'high'
    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800" title="OXL found serious concerns. Do not pay or ship until OXL contacts you.">⚠ Safety alert</span>
    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="OXL is checking concerns. Confirm details through OXL before paying or shipping.">⚠ Caution</span>
}

export const REPORT_CATEGORY = {
  fraud: 'Fraud or scam', payment: 'Payment problem (e.g. asked to pay a personal account)', non_delivery: 'Goods not delivered',
  quality: 'Goods not as described', impersonation: 'Pretending to be someone else', harassment: 'Harassment or threats', other: 'Something else',
}

// "Report a problem" form about another business; reporterOrgId lets an agent report for its client
export function ReportProblem({ reporterOrgId, reported, interestId, onClose }) {
  const [f, setF] = useState({ category: 'fraud', description: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  async function send(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.from('problem_reports').insert({ reporter_org_id: reporterOrgId, reported_org_id: reported.id,
      interest_id: interestId ?? null, category: f.category, description: f.description.trim() })
    setBusy(false)
    if (error) setMsg({ err: error.message.includes('description') ? 'Please describe what happened (at least a sentence).' : error.message })
    else setMsg({ ok: 'Thank you. OXL staff will look into it and get back to you. Do not send money or goods while it is under review.' })
  }
  return (
    <form onSubmit={send} className="mt-3 grid gap-3 rounded-lg border border-red-200 bg-red-50/40 p-4 sm:grid-cols-3">
      <div className="sm:col-span-3 flex items-start justify-between gap-2"><b>Report a problem with {reported.name}</b>
        {onClose && <button type="button" className="text-sm text-navy/60" onClick={onClose}>Close</button>}</div>
      <div><label className="label">What happened?</label>
        <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {Object.entries(REPORT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Details</label>
        <textarea className="input" rows={2} required minLength={10} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="Dates, amounts, phone numbers or accounts used, what was promised" /></div>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy || !!msg?.ok}>{busy ? 'Sending…' : 'Send report'}</button>
        <span className="text-xs text-navy/60">The business is not told who reported it. False reports may lead to suspension.</span>
      </div>
      {msg && <p className={`sm:col-span-3 text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
    </form>
  )
}
