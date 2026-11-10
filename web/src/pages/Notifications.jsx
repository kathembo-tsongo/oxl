import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Notifications() {
  const [rows, setRows] = useState([])
  const load = () => supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    // Mark everything as read once the page has been opened
    supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).then(() => window.dispatchEvent(new Event('oxl-notifications')))
  }, [])
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Notifications</h2>
      {rows.length === 0 && <div className="card text-sm text-navy/60">Nothing yet. You will be told here about new interest in your listings, deal updates, verification results and changes to ready dates.</div>}
      <div className="card divide-y divide-line p-0">
        {rows.map((n) => (
          <div key={n.id} className={`flex flex-wrap items-start gap-3 px-5 py-3 ${n.read_at ? '' : 'bg-terra/5'}`}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-sm text-navy/70">{n.body}</div>}
            </div>
            <span className="text-xs text-navy/50">{new Date(n.created_at).toLocaleString()}</span>
            {n.link && <Link to={n.link} className="text-sm text-terra">Open →</Link>}
          </div>
        ))}
      </div>
    </section>
  )
}
