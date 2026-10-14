import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, ROLE_LABEL } from '../supabase'
import { useAuth } from '../App'
import { DemoBadge, ScoreFactors } from '../components/Badges'

const BAND_TEXT = { A: 'Strong evidence base', B: 'Good, some gaps', C: 'Limited evidence', D: 'Mostly unverified' }

export default function RiskReport() {
  const { orgId } = useParams()
  const { org } = useAuth()
  const [r, setR] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    setR(null); setErr(null)
    supabase.rpc('risk_report', { p_org_id: orgId }).then(({ data, error }) => error ? setErr(error.message) : setR(data))
  }, [orgId])
  const own = org?.id === orgId

  if (err) return (
    <div className="card max-w-xl">
      <h2 className="text-xl font-semibold">Risk report not available</h2>
      <p className="mt-2 text-sm text-navy/70">{err}. The organisation must share its report with you first; you can still express interest from the matches list.</p>
    </div>
  )
  if (!r) return <p className="text-navy/60">Loading report…</p>
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-navy/50">Counterparty risk report</p>
            <h2 className="text-2xl font-semibold">{r.org_name} <DemoBadge show={r.is_demo} /></h2>
            <p className="text-sm text-navy/60">{ROLE_LABEL[r.role]} · {r.country}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold tabular-nums">{r.score}<span className="text-lg text-navy/40">/100</span></div>
            <div className="text-sm"><b>Band {r.band}</b> · {BAND_TEXT[r.band]}</div>
          </div>
        </div>
        <div className="mt-6"><ScoreFactors factors={r.factors} /></div>
        <p className="mt-6 border-t border-line pt-3 text-xs text-navy/50">{r.disclaimer} Generated {new Date(r.generated_at).toLocaleString()}.</p>
      </div>
      {own && <ShareControls orgId={orgId} />}
    </div>
  )
}

function ShareControls({ orgId }) {
  const [fis, setFis] = useState([])
  const [shared, setShared] = useState(new Set())
  const load = async () => {
    const { data: f } = await supabase.from('organisations').select('id, name, country').eq('role', 'financier').order('name')
    const { data: s } = await supabase.from('report_shares').select('shared_with_org_id').eq('org_id', orgId)
    setFis(f ?? []); setShared(new Set((s ?? []).map((x) => x.shared_with_org_id)))
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line
  async function toggle(id) {
    if (shared.has(id)) await supabase.from('report_shares').delete().eq('org_id', orgId).eq('shared_with_org_id', id)
    else await supabase.from('report_shares').insert({ org_id: orgId, shared_with_org_id: id })
    load()
  }
  return (
    <div className="card h-fit">
      <h3 className="font-semibold">Share with financiers</h3>
      <p className="mt-1 text-xs text-navy/60">Only financiers you tick can see this report and your documents. You can withdraw at any time.</p>
      <ul className="mt-3 space-y-2">
        {fis.map((f) => (
          <li key={f.id}><label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shared.has(f.id)} onChange={() => toggle(f.id)} /> {f.name} <span className="text-navy/40">{f.country}</span>
          </label></li>
        ))}
      </ul>
    </div>
  )
}
