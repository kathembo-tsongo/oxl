// Public invitation page: a prospect opens its personal link and chooses to join or to opt out (§6.3)
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'

export const INVITE_KEY = 'oxl_invite_token'

export default function Invite() {
  const { token } = useParams()
  const [info, setInfo] = useState(undefined)
  const [done, setDone] = useState(null)
  useEffect(() => { supabase.rpc('prospect_invite_info', { p_token: token }).then(({ data }) => setInfo(data ?? null)) }, [token])

  function join() { try { localStorage.setItem(INVITE_KEY, token) } catch { /* storage blocked: the claim is simply skipped */ } }
  async function optOut() {
    const { data } = await supabase.rpc('prospect_opt_out', { p_token: token })
    setDone(data ? 'optout' : 'missing')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="card w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2"><svg width="22" height="22" viewBox="0 0 32 32"><path d="M16 4 28 16 16 28 4 16z" fill="#A3472A" /></svg><span className="font-serif text-lg font-semibold">OXL</span></div>
        {info === undefined && <p className="text-navy/60">Loading…</p>}
        {info === null && !done && <p>This invitation is no longer valid. It may have been used already, or the business opted out.</p>}
        {info && !done && (
          <>
            <h1 className="text-2xl font-semibold">{info.name}, you are invited to OXL</h1>
            <p className="text-sm text-navy/70">OXL connects verified agribusiness buyers and sellers between Kenya, Ghana and other markets, checks that deliveries can arrive on time, and helps businesses reach trade finance.</p>
            <p className="text-sm text-navy/70">We found your business in a public source. We only hold your business name, country, products and published business contact. Nothing is shown to other users until you join and are verified.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/" onClick={join} className="btn-primary">Join OXL</Link>
              <button className="btn-ghost" onClick={optOut}>No thanks: delete my details</button>
            </div>
          </>
        )}
        {done === 'optout' && <p className="text-leaf">Done. Your details have been deleted from OXL and you will not be contacted again.</p>}
        {done === 'missing' && <p>We could not find these details. They may already have been deleted.</p>}
      </div>
    </div>
  )
}
