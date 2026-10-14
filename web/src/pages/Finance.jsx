import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../App'

export default function Finance() {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ amount: '', purpose: '' })
  const [err, setErr] = useState(null)
  const load = () => supabase.from('finance_requests').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [org.id]) // eslint-disable-line
  async function save(e) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.from('finance_requests').insert({ org_id: org.id, amount_usd: Number(f.amount), purpose: f.purpose })
    if (error) setErr(error.message); else { setF({ amount: '', purpose: '' }); load() }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={save} className="card h-fit space-y-3">
        <h2 className="text-xl font-semibold">Request trade finance</h2>
        <p className="text-xs text-navy/60">Financiers on OXL see your request, tier and country. To let them see your full risk report, <Link className="text-terra" to={`/report/${org.id}`}>share it</Link>.</p>
        <div><label className="label">Amount (USD)</label><input className="input" type="number" min="1" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><label className="label">Purpose</label><textarea className="input" rows={3} required value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Pre-export finance for 30 t cocoa to Nairobi" /></div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full">Submit request</button>
      </form>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Your requests</h2>
        {rows.length === 0 && <div className="card text-sm text-navy/60">None yet.</div>}
        {rows.map((r) => (
          <div key={r.id} className="card flex items-center gap-4">
            <div className="text-lg font-semibold tabular-nums">${Number(r.amount_usd).toLocaleString()}</div>
            <div className="flex-1 text-sm">{r.purpose}</div>
            <div className="text-xs text-navy/50">{r.status}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
