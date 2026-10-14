import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, TIER_LABEL } from '../supabase'
import { DocCard } from './Documents'
import { DemoBadge, TierBadge } from '../components/Badges'

export default function Admin() {
  const [docs, setDocs] = useState([])
  const [orgs, setOrgs] = useState([])
  const load = () => {
    supabase.from('documents').select('*, organisations(name, country)').eq('review_status', 'pending').order('created_at').then(({ data }) => setDocs(data ?? []))
    supabase.from('organisations').select('*').order('created_at', { ascending: false }).then(({ data }) => setOrgs(data ?? []))
  }
  useEffect(() => { load() }, [])

  async function review(d, status) {
    const notes = status === 'rejected' ? prompt('Reason for rejection (shown to the organisation):') : null
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('documents').update({ review_status: status, review_notes: notes, reviewed_by: user.id }).eq('id', d.id)
    load()
  }
  async function view(d) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  async function setTier(o, tier) {
    const method = prompt(`How was ${o.name} verified as "${TIER_LABEL[tier]}"? (e.g. document review, BRS registry search, site visit)`)
    if (!method) return
    const { error } = await supabase.rpc('set_verification_tier', { p_org_id: o.id, p_tier: tier, p_method: method, p_notes: null })
    if (error) alert(error.message); load()
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-semibold">Documents awaiting review <span className="text-navy/40">{docs.length}</span></h2>
        <div className="mt-4 space-y-3">
          {docs.length === 0 && <div className="card text-sm text-navy/60">Queue is empty.</div>}
          {docs.map((d) => (
            <DocCard key={d.id} d={d}>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
                <span className="mr-auto text-navy/70">{d.organisations?.name} · {d.organisations?.country}</span>
                <button className="btn-ghost" onClick={() => view(d)}>Open file</button>
                <button className="btn-ghost" onClick={() => supabase.functions.invoke('extract-document', { body: { document_id: d.id } }).then(load)}>Re-run AI</button>
                <button className="btn-ghost text-red-700" onClick={() => review(d, 'rejected')}>Reject</button>
                <button className="btn-primary" onClick={() => review(d, 'approved')}>Approve</button>
              </div>
            </DocCard>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Organisations</h2>
        <table className="card mt-4 w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-navy/50"><th className="py-1">Name</th><th>Country</th><th>Role</th><th>Tier</th><th>Set tier</th></tr></thead>
          <tbody>{orgs.map((o) => (
            <tr key={o.id} className="border-t border-line">
              <td className="py-2"><Link className="hover:underline" to={`/report/${o.id}`}>{o.name}</Link> <DemoBadge show={o.is_demo} /></td>
              <td>{o.country}</td><td className="capitalize">{o.role}</td><td><TierBadge tier={o.verification_tier} /></td>
              <td><select className="input py-1" value="" onChange={(e) => e.target.value && setTier(o, e.target.value)}>
                <option value="">Change…</option>{Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  )
}
