import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase, ROLE_LABEL } from '../supabase'
import Listings from '../components/Listings'
import { DemoBadge, TierBadge } from '../components/Badges'
import AgentHome from '../components/AgentHome'

export default function Dashboard() {
  const { org } = useAuth()
  if (org.role === 'agent') return <AgentHome />
  if (org.role === 'exporter') return <><NextStep /><Listings kind="offer" /></>
  if (org.role === 'importer') return <><NextStep /><Listings kind="request" /></>
  if (org.role === 'financier') return <FinancierHome />
  return <PartnerHome />
}

function NextStep() {
  const { org } = useAuth()
  if (org.verification_tier !== 'self_declared') return null
  return (
    <div className="mb-6 rounded-xl border border-terra/30 bg-terra/5 p-4 text-sm">
      <b>Raise your verification tier.</b> Buyers and financiers rank verified firms higher.{' '}
      <Link to="/documents" className="font-medium text-terra underline">Upload your registration and export documents →</Link>
    </div>
  )
}

function FinancierHome() {
  const { org } = useAuth()
  const [fr, setFr] = useState([])
  const [shared, setShared] = useState([])
  useEffect(() => {
    supabase.from('finance_requests').select('*, organisations(id, name, country, verification_tier, is_demo)').eq('status', 'open').order('created_at', { ascending: false }).then(({ data }) => setFr(data ?? []))
    supabase.from('report_shares').select('org_id, created_at, organisations!report_shares_org_id_fkey(name, country, verification_tier, is_demo)').eq('shared_with_org_id', org.id).then(({ data }) => setShared(data ?? []))
  }, [org.id])
  const sharedIds = new Set(shared.map((s) => s.org_id))
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold">Finance requests</h2>
        <p className="text-sm text-navy/60">Open requests from traders on OXL. Full risk reports are visible only where the trader has shared theirs with you.</p>
        <div className="mt-4 grid gap-3">
          {fr.length === 0 && <div className="card text-sm text-navy/60">No open requests.</div>}
          {fr.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-4">
              <div className="text-xl font-semibold tabular-nums">${Number(r.amount_usd).toLocaleString()}</div>
              <div className="flex-1 min-w-[14rem]">
                <div className="font-medium">{r.organisations?.name}</div>
                <div className="text-sm text-navy/60">{r.purpose}</div>
              </div>
              <div className="flex items-center gap-2 text-xs">{r.organisations?.country} <TierBadge tier={r.organisations?.verification_tier} /> <DemoBadge show={r.organisations?.is_demo} /></div>
              {sharedIds.has(r.org_id)
                ? <Link to={`/report/${r.org_id}`} className="btn-primary">View risk report</Link>
                : <span className="text-xs text-navy/50">Report not shared</span>}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Reports shared with you</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {shared.length === 0 && <div className="card text-sm text-navy/60">None yet.</div>}
          {shared.map((s) => (
            <Link key={s.org_id} to={`/report/${s.org_id}`} className="card hover:border-navy/40">
              <div className="font-medium">{s.organisations?.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-navy/60">{s.organisations?.country} <TierBadge tier={s.organisations?.verification_tier} /> <DemoBadge show={s.organisations?.is_demo} /></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

// Partner dashboard: confirm members, see them by country, type and trust level (user stories P1, P2)
function PartnerHome() {
  const { org } = useAuth()
  const [members, setMembers] = useState([])
  const [err, setErr] = useState(null)
  const load = () => supabase.from('partner_members')
    .select('*, member:organisations!partner_members_member_org_id_fkey(id, name, role, country, city, verification_tier, is_demo)')
    .eq('partner_org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setMembers(data ?? []))
  useEffect(() => { load() }, [org.id]) // eslint-disable-line
  async function confirm(m, on) {
    setErr(null)
    const q = on ? supabase.from('partner_members').update({ confirmed: true }).eq('partner_org_id', org.id).eq('member_org_id', m.member_org_id)
                 : supabase.from('partner_members').delete().eq('partner_org_id', org.id).eq('member_org_id', m.member_org_id)
    const { error } = await q; if (error) setErr(error.message); load()
  }
  const confirmed = members.filter((m) => m.confirmed)
  const pending = members.filter((m) => !m.confirmed)
  const stats = {}
  for (const m of confirmed) {
    const k = `${m.member?.country}|${m.member?.role}`
    stats[k] ??= { country: m.member?.country, role: m.member?.role, total: 0, verified: 0 }
    stats[k].total++; if (m.member?.verification_tier !== 'self_declared') stats[k].verified++
  }
  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-xs uppercase tracking-wide text-navy/50">Confirmed members</div><div className="mt-1 text-2xl font-semibold tabular-nums">{confirmed.length}</div></div>
        <div className="card"><div className="text-xs uppercase tracking-wide text-navy/50">Verified members</div><div className="mt-1 text-2xl font-semibold tabular-nums">{confirmed.filter((m) => m.member?.verification_tier !== 'self_declared').length}</div></div>
        <div className="card"><div className="text-xs uppercase tracking-wide text-navy/50">Waiting for confirmation</div><div className="mt-1 text-2xl font-semibold tabular-nums">{pending.length}</div></div>
      </section>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {pending.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">Membership requests</h2>
          <p className="text-sm text-navy/60">These businesses say they are your members. Confirm only those you recognise.</p>
          {pending.map((m) => (
            <div key={m.member_org_id} className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <span className="flex-1 font-medium">{m.member?.name} <span className="text-xs font-normal text-navy/60">{ROLE_LABEL[m.member?.role]} · {m.member?.country}</span></span>
              <button className="btn-primary" onClick={() => confirm(m, true)}>Confirm</button>
              <button className="btn-ghost" onClick={() => confirm(m, false)}>Not a member</button>
            </div>))}
        </section>
      )}
      <section>
        <h2 className="text-2xl font-semibold">Your members</h2>
        <p className="text-sm text-navy/60">By country, type and verification level. <Link to="/directory" className="text-terra underline">Open the directory</Link> to find others.</p>
        {confirmed.length === 0 ? <div className="card mt-4 text-sm text-navy/60">No confirmed members yet. Businesses can name you as their association on their Profile page.</div> : (
          <>
            <table className="card mt-4 w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="py-1">Country</th><th>Type</th><th className="text-right">Members</th><th className="text-right">Verified</th></tr></thead>
              <tbody>{Object.values(stats).map((s) => (
                <tr key={s.country + s.role} className="border-t border-line"><td className="py-2">{s.country}</td><td>{ROLE_LABEL[s.role]}</td><td className="text-right tabular-nums">{s.total}</td><td className="text-right tabular-nums">{s.verified}</td></tr>
              ))}</tbody>
            </table>
            <div className="mt-4 grid gap-3 md:grid-cols-2">{confirmed.map((m) => (
              <div key={m.member_org_id} className="card flex items-start justify-between gap-3">
                <div><div className="font-medium">{m.member?.name}</div><div className="text-xs text-navy/60">{ROLE_LABEL[m.member?.role]} · {m.member?.city ? `${m.member.city}, ` : ''}{m.member?.country}</div></div>
                <div className="flex shrink-0 gap-1.5"><TierBadge tier={m.member?.verification_tier} /><DemoBadge show={m.member?.is_demo} /></div>
              </div>))}</div>
          </>
        )}
      </section>
    </div>
  )
}
