import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, DOC_LABEL } from '../supabase'
import { useAuth } from '../App'

export default function Documents() {
  const { org } = useAuth()
  const [docs, setDocs] = useState([])
  const [type, setType] = useState('business_registration')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const load = () => supabase.from('documents').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setDocs(data ?? []))
  useEffect(() => { load() }, [org.id]) // eslint-disable-line

  async function upload(e) {
    e.preventDefault(); if (!file) return
    setBusy(true); setErr(null)
    try {
      const path = `${org.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      const { data: doc, error: insErr } = await supabase.from('documents')
        .insert({ org_id: org.id, doc_type: type, file_name: file.name, storage_path: path, uploaded_by: user.id }).select().single()
      if (insErr) throw insErr
      setFile(null); e.target.reset(); load()
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
            {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</button>
        <Link to={`/report/${org.id}`} className="block text-center text-sm text-terra">See my risk report →</Link>
      </form>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Your documents</h2>
        {docs.length === 0 && <div className="card text-sm text-navy/60">No documents yet.</div>}
        {docs.map((d) => <DocCard key={d.id} d={d} />)}
      </div>
    </div>
  )
}

export function DocCard({ d, children }) {
  const x = d.extracted
  const status = { pending: 'text-amber-700', approved: 'text-leaf', rejected: 'text-red-700' }[d.review_status]
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-medium">{DOC_LABEL[d.doc_type]}</div>
        <div className="text-sm text-navy/60">{d.file_name}</div>
        <div className={`ml-auto text-xs font-medium ${status}`}>Review: {d.review_status}</div>
        <div className="text-xs text-navy/50">AI: {d.extraction_status}</div>
      </div>
      {x && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {[['Company', x.company_name], ['Number', x.registration_or_licence_no], ['Issuer', x.issuing_authority], ['Issued', x.issue_date], ['Expires', x.expiry_date], ['Confidence', x.confidence]]
            .map(([k, v]) => <div key={k}><dt className="text-navy/50">{k}</dt><dd>{v ?? '—'}</dd></div>)}
        </dl>
      )}
      {x?.red_flags?.length > 0 && <p className="mt-2 text-xs text-red-700">⚑ {x.red_flags.join(' · ')}</p>}
      {x?.is_expired && <p className="mt-1 text-xs text-red-700">⚑ Document appears expired</p>}
      {d.review_notes && <p className="mt-2 text-xs text-navy/60">Note: {d.review_notes}</p>}
      {children}
    </div>
  )
}
