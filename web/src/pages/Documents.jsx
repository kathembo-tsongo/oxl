import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, DOC_LABEL, IDENTITY_TYPES, docTypesFor } from '../supabase'
import { useAuth } from '../App'
import { PageHeader, EmptyState } from '../components/Page'

export default function Documents({ forOrg }) {
  const { org: myOrg } = useAuth()
  const org = forOrg ?? myOrg
  const [docs, setDocs] = useState([])
  const types = docTypesFor(org)
  const [type, setType] = useState(types[0])
  const [file, setFile] = useState(null)
  const [backFile, setBackFile] = useState(null)
  const [holder, setHolder] = useState({ name: '', role: 'Director' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const needsBack = ['national_id', 'driving_licence'].includes(type)

  const load = () => supabase.from('documents').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setDocs(data ?? []))
  useEffect(() => { load() }, [org.id]) // eslint-disable-line

  // Remove a document that is still waiting for review (the database allows this only while it is pending)
  const [listErr, setListErr] = useState(null)
  async function remove(d) {
    if (!window.confirm('Remove this document? You can upload a new one afterwards.')) return
    setListErr(null)
    const { data, error } = await supabase.from('documents').delete().eq('id', d.id).select('id')
    if (error || !data?.length) { setListErr(error?.message ?? 'This document can no longer be removed. OXL staff have already reviewed it.'); return }
    const paths = [d.storage_path, d.back_file_path].filter(Boolean)
    if (paths.length) await supabase.storage.from('documents').remove(paths)
    load()
  }

  async function upload(e) {
    e.preventDefault(); if (!file) return
    if (needsBack && !backFile) { setErr('Please upload the back of the document.'); return }
    setBusy(true); setErr(null)
    try {
      const identity = IDENTITY_TYPES.includes(type)
      const frontPath = `${org.id}/${identity ? 'identity/' : ''}${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error: frontErr } = await supabase.storage.from('documents').upload(frontPath, file)
      if (frontErr) throw frontErr
      let backPath = null
      if (backFile) {
        backPath = `${org.id}/${identity ? 'identity/' : ''}${crypto.randomUUID()}-back-${backFile.name.replace(/[^\w.-]+/g, '_')}`
        const { error: backErr } = await supabase.storage.from('documents').upload(backPath, backFile)
        if (backErr) throw backErr
      }
      const { data: { user } } = await supabase.auth.getUser()
      const { data: doc, error: insErr } = await supabase.from('documents')
        .insert({ org_id: org.id, doc_type: type, file_name: file.name, storage_path: frontPath, back_file_path: backPath, uploaded_by: user.id,
          ...(type === 'representative_id' ? { holder_name: holder.name.trim(), holder_role: holder.role } : {}) }).select().single()
      if (insErr) throw insErr
      setFile(null); setBackFile(null); setHolder({ name: '', role: 'Director' }); e.target.reset(); load()
      // AI extraction runs in the background; the list refreshes when it finishes
      supabase.functions.invoke('extract-document', { body: { document_id: doc.id } }).finally(load)
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
    {!forOrg && <PageHeader title="Documents" subtitle="Upload the documents that prove who you are and what you trade. OXL reads each one and a staff member reviews it before your trust level goes up." />}
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
        {IDENTITY_TYPES.includes(type) && (
          <details open className="rounded-lg border border-line bg-cream p-3 text-xs text-navy/80">
            <summary className="cursor-pointer text-[13px] font-medium text-navy">How to photograph your ID</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li><b>National ID and driving licence have two sides.</b> Upload the front in the first box and the back in the second. We cannot accept one side only.</li>
              <li><b>Passport:</b> upload only the page with your photo and details.</li>
              <li>Lay it flat on a plain, dark surface in good light. Keep all four corners in the picture.</li>
              <li>Avoid glare and shadows, and keep your fingers off the text. Every word and the number must be readable.</li>
              <li>Use a colour photo or scan, not a black and white photocopy. Do not crop or edit it.</li>
              <li>The ID must still be valid, and the name must match the name on your profile.</li>
              <li>JPG, PNG or PDF, up to 20 MB each.</li>
              {type === 'representative_id' && <li>For a company or cooperative, upload one ID for each of two directors or representatives, and type their names above.</li>}
            </ul>
          </details>
        )}
        <div>
          <label className="label">Front of document</label>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        {IDENTITY_TYPES.includes(type) && (
          <div>
            <label className="label">Back of document</label>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setBackFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <p className="mt-1 text-xs text-navy/60">{needsBack ? 'Required for national IDs and driving licences.' : 'Optional for single-sided identity documents.'}</p>
          </div>
        )}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !file || (needsBack && !backFile)}>{busy ? 'Uploading…' : 'Upload'}</button>
        {org.role !== 'agent' && !forOrg && <Link to={`/report/${org.id}`} className="block text-center text-sm text-terra">See my risk report →</Link>}
      </form>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{forOrg ? `Documents of ${org.name}` : 'Your documents'}</h2>
        {docs.length === 0 && <EmptyState neutral title={forOrg ? 'No documents you can see' : 'No documents yet'}>{forOrg ? 'You can upload for this client; to see its documents, the client must allow it on its Profile page.' : 'Choose a document type on the left and upload your first file.'}</EmptyState>}
        {listErr && <p className="text-sm text-red-700">{listErr}</p>}
        {docs.map((d) => <DocCard key={d.id} d={d} onRemove={!forOrg && d.review_status === 'pending' ? () => remove(d) : undefined} />)}
      </div>
    </div>
    </div>
  )
}

// AI output can come back in any shape, so normalise before rendering
const txt = (v) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v))
const list = (v) => (Array.isArray(v) ? v.map(txt) : v ? [txt(v)] : [])

export function DocCard({ d, children, onRemove }) {
  const x = d.extracted && typeof d.extracted === 'object' ? d.extracted : null
  const flags = list(x?.red_flags)
  const status = { pending: 'bg-gold/25 text-gold-ink', approved: 'bg-leaf/15 text-leaf', rejected: 'bg-coral/15 text-coral-ink' }[d.review_status]
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-medium">{DOC_LABEL[d.doc_type] ?? d.doc_type}{d.holder_name ? `: ${d.holder_name}${d.holder_role ? ` (${d.holder_role})` : ''}` : ''}</div>
        <div className="text-sm text-navy/60">{d.file_name}</div>
        <div className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${status}`}>Review: {d.review_status}</div>
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
      {d.extraction_status === 'failed' && <p className="mt-2 text-xs text-red-700">AI reading failed{d.review_notes ? `: ${txt(d.review_notes)}` : ''}{onRemove ? '. Remove it and upload a clearer photo, or wait for OXL staff to review it.' : ''}</p>}
      {d.extraction_status !== 'failed' && d.review_notes && <p className="mt-2 text-xs text-navy/60">Note: {txt(d.review_notes)}</p>}
      {onRemove && <div className="mt-3 border-t border-line pt-2 text-right"><button type="button" className="text-xs font-medium text-terra hover:underline" onClick={onRemove}>Remove this document</button></div>}
      {children}
    </div>
  )
}
