// OXL staff: products that users could not find. Add the product on the Products tab first, then mark the request as added.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { EmptyState } from './Page'

const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function ProductRequests() {
  const [rows, setRows] = useState([])
  const [notes, setNotes] = useState({})
  const [msg, setMsg] = useState(null)
  const load = () => supabase.rpc('list_product_requests').then(({ data, error }) => { if (error) setMsg({ err: error.message }); else setRows(data ?? []) })
  useEffect(() => { load() }, [])

  async function resolve(r, status) {
    setMsg(null)
    const { error } = await supabase.rpc('resolve_product_request', { p_id: r.id, p_status: status, p_staff_note: notes[r.id]?.trim() || null })
    setMsg(error ? { err: error.message } : { ok: status === 'added' ? `${r.name} marked as added. The requester was notified.` : `${r.name} declined. The requester was notified.` })
    if (!error) load()
  }
  const open = rows.filter((r) => r.status === 'open')
  const closed = rows.filter((r) => r.status !== 'open')
  const who = (r) => r.org_name ?? r.requester_email ?? 'Unknown'

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy/70">Products users could not find in the list. Add the product on the Products tab first, then mark the request as added. The person is notified either way.</p>
      {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.err ?? msg.ok}</p>}
      {open.length === 0 && <EmptyState title="No open requests">When someone cannot find a product, their request appears here.</EmptyState>}
      {open.map((r) => (
        <div key={r.id} className="card space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-sans text-base font-semibold">{r.name}</h3>
            <span className="text-sm text-navy/70">{who(r)}{r.org_name && r.requester_email ? ` · ${r.requester_email}` : ''}</span>
            <span className="ml-auto text-xs text-navy/60">{day(r.created_at)}</span>
          </div>
          {r.note && <p className="text-sm">{r.note}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input className="input min-w-[14rem] flex-1" placeholder="Note to the requester (optional)" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
            <button className="btn-primary" onClick={() => resolve(r, 'added')}>Mark as added</button>
            <button className="btn-ghost" onClick={() => resolve(r, 'declined')}>Decline</button>
          </div>
        </div>
      ))}
      {closed.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="text-left"><th className="px-4 py-2">Closed requests</th><th>From</th><th>Result</th><th className="pr-4 text-right">Date</th></tr></thead>
            <tbody>{closed.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-2">{r.name}</td><td>{who(r)}</td>
                <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.status === 'added' ? 'bg-leaf/15 text-leaf' : 'bg-navy/10 text-navy'}`}>{r.status === 'added' ? 'Added' : 'Declined'}</span></td>
                <td className="pr-4 text-right text-xs text-navy/60">{r.resolved_at ? day(r.resolved_at) : ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
