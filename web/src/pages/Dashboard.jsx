import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase, ROLE_LABEL } from '../supabase'
import Listings from '../components/Listings'
import { DemoBadge, TierBadge } from '../components/Badges'
import AgentHome from '../components/AgentHome'
import DashboardBanner from '../components/DashboardBanner'
import { StatTile, EmptyState } from '../components/Page'

export default function Dashboard() {
  return <><DashboardBanner /><DashboardBody /></>
}

function DashboardBody() {
  const { org } = useAuth()
  if (org.role === 'agent') return <AgentHome />
  if (org.role === 'exporter') return <><NextStep /><Listings kind="offer" /></>
  if (org.role === 'importer') return <><NextStep /><Listings kind="request" /></>
  if (org.role === 'financier') return <FinancierHome />
  return <PartnerHome />
}

function NextStep() {
  const { org } = useAuth()
  const [s, setS] = useState(null)
  const exporter = org.role === 'exporter'

  useEffect(() => {
    let live = true
    ;(async () => {
      const [idr, docs, loc, list] = await Promise.all([
        supabase.rpc('identity_requirement', { p_org: org.id }),
        supabase.from('documents').select('doc_type, review_status').eq('org_id', org.id),
        supabase.from('org_locations').select('org_id, reviewed_at').eq('org_id', org.id).maybeSingle(),
        supabase.from(exporter ? 'offers' : 'requests').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
      ])
      if (!live) return
      const id = (idr.data ?? [])[0]
      const other = (docs.data ?? []).filter((d) => !['national_id', 'representative_id'].includes(d.doc_type) && d.review_status !== 'rejected')
      setS({ id, other: other.length, loc: loc.data, listed: list.count ?? 0 })
    })()
    return () => { live = false }
  }, [org.id, exporter])

  if (!s) return null
  const idDone = !!s.id && s.id.uploaded >= s.id.required
  const steps = [
    { key: 'id', done: idDone, title: s.id?.required === 2 ? 'Upload two director or representative IDs' : 'Upload your ID',
      note: s.id ? `${s.id.uploaded} of ${s.id.required} uploaded${s.id.approved ? `, ${s.id.approved} approved by OXL` : ''}` : 'National ID or passport', to: '/profile', cta: 'Open profile' },
    { key: 'loc', done: !!s.loc, title: 'Pin your business location',
      note: s.loc ? (s.loc.reviewed_at ? 'Location checked by OXL' : 'Pinned, waiting for OXL to check it') : 'Shown only to you, your agent and OXL staff', to: '/profile', cta: 'Pin on map' },
    { key: 'docs', done: s.other > 0, title: 'Upload your registration and export documents',
      note: s.other > 0 ? `${s.other} uploaded` : 'Registration certificate, licences and similar', to: '/documents', cta: 'Upload documents' },
    { key: 'list', done: s.listed > 0, title: exporter ? 'Post your first offer' : 'Post your first request',
      note: s.listed > 0 ? `${s.listed} posted` : 'Add it below on this page', to: null, cta: null },
  ]
  const done = steps.filter((x) => x.done).length

  if (done === steps.length && org.verification_tier !== 'self_declared') {
    return <div className="mb-6 flex items-center gap-2 rounded-xl border border-leaf/30 bg-leaf/5 p-3 text-sm"><span className="font-medium text-leaf">✓ You are verified.</span><TierBadge tier={org.verification_tier} /></div>
  }

  return (
    <section className="card mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Get verified</h2>
          <p className="text-sm text-navy/60">{done === steps.length ? 'All steps done. OXL staff will review your business and raise your trust level.' : 'Buyers and financiers rank verified businesses higher. Complete these steps:'}</p>
        </div>
        <div className="text-sm font-medium tabular-nums">{done} of {steps.length}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="mt-3 divide-y divide-line">
        {steps.map((x, i) => (
          <li key={x.key} className="flex items-center gap-3 py-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${x.done ? 'bg-leaf text-white' : 'border border-line bg-white text-navy/60'}`}>{x.done ? '✓' : i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-medium ${x.done ? 'text-navy/60 line-through' : ''}`}>{x.title}</span>
              <span className="block text-xs text-navy/60">{x.note}</span>
            </span>
            {!x.done && x.to && <Link to={x.to} className="btn-ghost shrink-0 !px-3 !py-1.5">{x.cta}</Link>}
          </li>
        ))}
      </ul>
    </section>
  )
}

// GetVerified: four-step checklist above (kept under the NextStep name used by the dashboard).

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
          {fr.length === 0 && <EmptyState neutral title="No open requests">New finance requests from traders appear here.</EmptyState>}
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
          {shared.length === 0 && <div className="sm:col-span-2"><EmptyState neutral title="No shared reports yet">When a trader shares their risk report with you, it appears here.</EmptyState></div>}
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
        <StatTile label="Confirmed members" value={confirmed.length} tone="ok" />
        <StatTile label="Verified members" value={confirmed.filter((m) => m.member?.verification_tier !== 'self_declared').length} tone="ok" hint="Above self-declared" />
        <StatTile label="Waiting for confirmation" value={pending.length} tone={pending.length ? 'warn' : 'none'} />
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
        <p className="text-sm text-navy/60">By country, type and verification level. <Link to="/database" className="text-terra underline">Open the database</Link> to find others.</p>
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
