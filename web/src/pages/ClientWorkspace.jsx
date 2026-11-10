// Agent workspace for one client: post and manage listings, upload documents (user story A3).
// Database rules allow this only while the client's consent is active.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, ROLE_LABEL, CONSENT_LABEL } from '../supabase'
import { useAuth } from '../App'
import { TierBadge } from '../components/Badges'
import Listings from '../components/Listings'
import Documents from './Documents'

export default function ClientWorkspace() {
  const { orgId } = useParams()
  const { org } = useAuth()
  const [client, setClient] = useState(null)
  const [link, setLink] = useState(null)
  const [tab, setTab] = useState('listings')
  useEffect(() => {
    supabase.from('organisations').select('*').eq('id', orgId).single().then(({ data }) => setClient(data))
    supabase.from('agent_clients').select('*').eq('agent_org_id', org.id).eq('client_org_id', orgId).maybeSingle().then(({ data }) => setLink(data ?? false))
  }, [orgId, org.id])

  if (!client || link === null) return <p className="text-navy/60">Loading…</p>
  if (!link || link.withdrawn_at) return (
    <div className="card max-w-xl">
      <h2 className="text-xl font-semibold">No active consent</h2>
      <p className="mt-2 text-sm text-navy/70">You can act for {client.name} only while it has given you consent. {link?.withdrawn_at ? `Consent was withdrawn on ${new Date(link.withdrawn_at).toLocaleDateString()}.` : ''}</p>
      <Link to="/" className="mt-3 inline-block text-sm text-terra">← Back to your clients</Link>
    </div>
  )
  const tabCls = (t) => `px-3 py-1.5 rounded-md text-sm ${tab === t ? 'bg-navy text-white' : 'border border-line bg-white'}`
  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-terra">← Your clients</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">{client.name}</h2>
          <TierBadge tier={client.verification_tier} />
          <span className="text-sm text-navy/60">{ROLE_LABEL[client.role]} · {client.city ? `${client.city}, ` : ''}{client.country}</span>
        </div>
        <p className="mt-1 text-xs text-navy/60">Acting as agent · consent: {CONSENT_LABEL[link.consent_method]}, {new Date(link.consent_given_at).toLocaleDateString()} · document access: {link.can_view_documents ? 'allowed' : 'upload only'}</p>
      </div>
      <div className="flex gap-2">
        <button className={tabCls('listings')} onClick={() => setTab('listings')}>{client.role === 'exporter' ? 'Offers' : 'Requests'}</button>
        <button className={tabCls('documents')} onClick={() => setTab('documents')}>Documents</button>
      </div>
      {tab === 'listings' && ['exporter', 'importer'].includes(client.role) && <Listings kind={client.role === 'exporter' ? 'offer' : 'request'} forOrg={client} />}
      {tab === 'documents' && <Documents forOrg={client} />}
    </div>
  )
}
