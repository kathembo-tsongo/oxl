import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, DOC_LABEL, IDENTITY_TYPES, docTypesFor } from '../supabase'
import { useAuth } from '../App'

export default function Documents({ forOrg }) {
  const { org: myOrg } = useAuth()
  const org = forOrg ?? myOrg
  const [docs, setDocs] = useState([])
  const types = docTypesFor(org)
  const [type, setType] = useState(types[0])
  const [file, setFile] = useState(null)
  const [holder, setHolder] = useState({ name: '', role: 'Director' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const load = () => supabase.from('documents').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setDocs(data ?? []))
  useEffect(() => { load() }, [org.id]) // eslint-disable-line

  async function upload(e) {
    e.preventDefault(); if (!file) return
    setBusy(true); setErr(null)
    try {
      const identity = IDENTITY_TYPES.includes(type)
      const path = `${org.id}/${identity ? 'identity/' : ''}${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      const { data: doc, error: insErr } = await supabase.from('documents')
        .insert({ org_id: org.id, doc_type: type, file_name: file.name, storage_path: path, uploaded_by: user.id,
          ...(type === 'representative_id' ? { holder_name: holder.name.trim(), holder_role: holder.role } : {}) }).select().single()
      if (insErr) throw insErr
      setFile(null); setHolder({ name: '', role: 'Director' }); e.target.reset(); load()
      // AI extraction runs in the background; the list refreshes when it finishes
      supabase.functions.invoke('extract-document', { body: { document_id: doc.id } }).finally(load)
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <form onSubmit={upload} className="card h-fit space-y-3">
        <h2 className="text-xl font-semibold">Upload a document</h2>
        <p className="text-xs text-navy/60">PDF or photo, up to 20 MB. OXL reads the key fields automatically; an OXL analyst then reviews it.</p>
        <div><label className="label">Document type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}
          </select></div>
        {type === 'representative_id' && <>
          <div><label className="label">Full name on the ID</label><input className="input" required value={holder.name} onChange={(e) => setHolder({ ...holder, name: e.target.value })} /></div>
          <div><label className="label">Role</label><input className="input" value={holder.role} onChange={(e) => setHolder({ ...holder, role: e.target.value })} placeholder="e.g. Director" /></div>
        </>}
        {IDENTITY_TYPES.includes(type) && <p className="text-xs text-navy/60">ID documents are seen only by you, your agent and OXL staff, never by lenders.</p>}
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</button>
        {org.role !== 'agent' && !forOrg && <Link to={`/report/${org.id}`} className="block text-center text-sm text-terra">See my risk report →</Link>}
      </form>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{forOrg ? `Documents of ${org.name}` : 'Your documents'}</h2>
        {docs.length === 0 && <div className="card text-sm text-navy/60">{forOrg ? 'No documents you can see. You can upload for this client; to see its documents, the client must allow it on its Profile page.' : 'No documents yet.'}</div>}
        {docs.map((d) => <DocCard key={d.id} d={d} />)}
      </div>
    </div>
  )
}

// AI output can come back in any shape, so normalise before rendering
const txt = (v) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v))
const list = (v) => (Array.isArray(v) ? v.map(txt) : v ? [txt(v)] : [])

export function DocCard({ d, children }) {
  const x = d.extracted && typeof d.extracted === 'object' ? d.extracted : null
  const flags = list(x?.red_flags)
  const status = { pending: 'text-amber-700', approved: 'text-leaf', rejected: 'text-red-700' }[d.review_status]
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-medium">{DOC_LABEL[d.doc_type] ?? d.doc_type}{d.holder_name ? `: ${d.holder_name}${d.holder_role ? ` (${d.holder_role})` : ''}` : ''}</div>
        <div className="text-sm text-navy/60">{d.file_name}</div>
        <div className={`ml-auto text-xs font-medium ${status}`}>Review: {d.review_status}</div>
        <div className="text-xs text-navy/50">AI: {d.extraction_status}</div>
      </div>
      {x && IDENTITY_TYPES.includes(d.doc_type) && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {[['Name on ID', x.holder_name], ['Document', x.detected_doc_type?.replace('_', ' ')], ['Number ends', x.id_number_last4 ? `…${x.id_number_last4}` : null],
            ['Country', x.issuing_country], ['Expires', x.expiry_date], ['Name matches', x.name_matches == null ? null : x.name_matches ? 'yes' : 'NO'], ['Photo', x.photo_present == null ? null : x.photo_present ? 'present' : 'missing'], ['Confidence', x.confidence]]
            .map(([k, v]) => <div key={k}><dt className="text-navy/50">{k}</dt><dd className={v === 'NO' || v === 'missing' ? 'font-medium text-red-700' : ''}>{txt(v)}</dd></div>)}
        </dl>
      )}
      {x && !IDENTITY_TYPES.includes(d.doc_type) && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {[['Company', x.company_name], ['Number', x.registration_or_licence_no], ['Issuer', x.issuing_authority], ['Issued', x.issue_date], ['Expires', x.expiry_date], ['Confidence', x.confidence]]
            .map(([k, v]) => <div key={k}><dt className="text-navy/50">{k}</dt><dd>{txt(v)}</dd></div>)}
        </dl>
      )}
      {flags.length > 0 && <p className="mt-2 text-xs text-red-700">⚑ {flags.join(' · ')}</p>}
      {x?.is_expired === true && <p className="mt-1 text-xs text-red-700">⚑ Document appears expired</p>}
      {d.extraction_status === 'failed' && <p className="mt-2 text-xs text-red-700">AI reading failed{d.review_notes ? `: ${txt(d.review_notes)}` : ''}</p>}
      {d.extraction_status !== 'failed' && d.review_notes && <p className="mt-2 text-xs text-navy/60">Note: {txt(d.review_notes)}</p>}
      {children}
    </div>
  )
}
