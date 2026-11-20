// OXL staff: who can act as an OXL admin. Add or remove staff by email.
// The person must already have an OXL account with a confirmed email. Admin rights work only after they
// set up two-step sign-in (an authenticator app); the list shows who has not yet.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function AdminStaff() {
  const [staff, setStaff] = useState([])
  const [history, setHistory] = useState([])
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    supabase.rpc('list_staff_admins').then(({ data, error }) => { if (error) setMsg({ err: error.message }); else setStaff(data ?? []) })
    supabase.rpc('staff_admin_history', { p_limit: 15 }).then(({ data }) => setHistory(data ?? []))
  }
  useEffect(() => { load() }, [])

  async function change(target, makeAdmin, ok) {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('set_staff_admin', { p_email: target, p_make_admin: makeAdmin })
    setBusy(false)
    if (error) setMsg({ err: error.message })
    else { setMsg({ ok }); if (makeAdmin) setEmail(''); load() }
  }

  function add(e) {
    e.preventDefault()
    const target = email.trim()
    if (!target) return
    change(target, true, `${target} is now an OXL admin. They must set up two-step sign-in the next time they sign in.`)
  }
  function remove(s) {
    if (!window.confirm(`Remove admin access for ${s.email}? They keep their account but lose every OXL staff function.`)) return
    change(s.email, false, `${s.email} is no longer an OXL admin.`)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Staff</h2>
        <p className="text-sm text-navy/70">People who can act as OXL staff: verify businesses, manage reference data and review safety reports. Admin rights work only after the person sets up two-step sign-in with an authenticator app.</p>
      </div>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.err ? 'bg-red-50 text-red-700' : 'bg-leaf/10 text-leaf'}`}>{msg.err ?? msg.ok}</p>}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Add a staff member</h3>
        <form onSubmit={add} className="card flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="staff-email">Email of their OXL account</label>
            <input id="staff-email" className="input" type="email" required placeholder="name@oxltrade.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? 'Please wait…' : 'Make admin'}</button>
          <p className="w-full text-xs text-navy/70">They must first sign up on OXL and confirm their email. If they have not, you will see a message saying so.</p>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Current staff <span className="text-navy/50">{staff.length}</span></h3>
        {staff.length === 0 && <div className="card text-sm text-navy/70">No staff found.</div>}
        {staff.map((s) => (
          <div key={s.user_id} className="card flex flex-wrap items-center gap-3 text-sm">
            <div className="min-w-[14rem] flex-1">
              <div className="font-medium">{s.email}{s.is_me && <span className="ml-2 rounded-full bg-navy/10 px-2 py-0.5 text-xs">you</span>}</div>
              <div className="text-xs text-navy/70">{s.full_name || 'No name yet'} · {s.last_sign_in_at ? `last sign-in ${new Date(s.last_sign_in_at).toLocaleString()}` : 'has not signed in'}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.mfa_enrolled ? 'bg-leaf/10 text-leaf' : 'bg-amber-100 text-amber-800'}`}>
              {s.mfa_enrolled ? 'Two-step on' : 'Two-step not set up'}
            </span>
            {!s.is_me && <button className="btn-ghost py-1 text-red-700" disabled={busy} onClick={() => remove(s)}>Remove admin</button>}
          </div>))}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recent changes</h3>
        {history.length === 0 && <div className="card text-sm text-navy/70">Nothing yet.</div>}
        {history.length > 0 && (
          <div className="card divide-y divide-line p-0 text-sm">
            {history.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${h.made_admin ? 'bg-leaf/10 text-leaf' : 'bg-red-100 text-red-800'}`}>{h.made_admin ? 'Added' : 'Removed'}</span>
                <b>{h.target_email}</b>
                <span className="text-navy/70">by {h.changed_by_email ?? 'unknown'}</span>
                <span className="ml-auto text-xs text-navy/70">{new Date(h.created_at).toLocaleString()}</span>
              </div>))}
          </div>)}
      </section>
    </div>
  )
}
