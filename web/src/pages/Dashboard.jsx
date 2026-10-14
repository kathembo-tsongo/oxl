import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase } from '../supabase'
import Listings from '../components/Listings'
import { DemoBadge, TierBadge } from '../components/Badges'

export default function Dashboard() {
  const { org } = useAuth()
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

function PartnerHome() {
  const [stats, setStats] = useState([])
  useEffect(() => {
    supabase.from('organisations').select('country, role, verification_tier').then(({ data }) => {
      const m = {}
      for (const o of data ?? []) {
        const k = `${o.country}|${o.role}`
        m[k] ??= { country: o.country, role: o.role, total: 0, verified: 0 }
        m[k].total++; if (o.verification_tier !== 'self_declared') m[k].verified++
      }
      setStats(Object.values(m).sort((a, b) => a.country.localeCompare(b.country) || a.role.localeCompare(b.role)))
    })
  }, [])
  return (
    <section>
      <h2 className="text-2xl font-semibold">Ecosystem overview</h2>
      <p className="text-sm text-navy/60">Organisations on OXL by country and role. <Link to="/directory" className="text-terra underline">Open the directory</Link> to see members.</p>
      <table className="card mt-4 w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="py-1">Country</th><th>Role</th><th className="text-right">Organisations</th><th className="text-right">Verified</th></tr></thead>
        <tbody>{stats.map((s) => (
          <tr key={s.country + s.role} className="border-t border-line"><td className="py-2">{s.country}</td><td className="capitalize">{s.role}</td><td className="text-right tabular-nums">{s.total}</td><td className="text-right tabular-nums">{s.verified}</td></tr>
        ))}</tbody>
      </table>
    </section>
  )
}
