// Identity documents (Richmond, 13 Nov 2026): individuals, traders and agents upload their own ID;
// enterprises, cooperatives, lenders and partners upload the IDs of two directors or representatives.
// OXL raises a trust level only once these are approved. Lenders never see them.
import { useEffect, useState } from 'react'
import { supabase, DOC_LABEL } from '../supabase'
import { DocCard } from '../pages/Documents'

const ROLES = ['Director', 'Managing director', 'Chairperson', 'Secretary', 'Treasurer', 'Authorised representative']

// Shown on the upload form so people know exactly what to send
function ScanHelp() {
  return (
    <details className="group rounded-lg border border-line bg-white px-3 py-2 text-sm sm:col-span-3">
      <summary className="cursor-pointer select-none font-medium text-terra">How do I scan both sides into one file?</summary>
      <div className="mt-2 space-y-3 text-navy/80">
        <div>
          <div className="font-medium text-navy">On your phone</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li><b>iPhone:</b> open Notes, tap the camera icon, choose <i>Scan Documents</i>. Scan the front, then scan the back. Tap <i>Save</i>, then share the PDF to your browser or save it to Files.</li>
            <li><b>Android:</b> open Google Drive, tap <i>+</i>, then <i>Scan</i>. Scan the front, tap <i>+</i> to add the back as page 2, then <i>Save</i> as PDF.</li>
            <li><b>Any phone:</b> the free Adobe Scan app does the same.</li>
          </ul>
        </div>
        <div>
          <div className="font-medium text-navy">No scanner? Use one photo</div>
          <p className="mt-1">Lay the ID on a plain dark surface, front and back side by side (or one above the other), and take <b>one</b> photo with both sides in the frame.</p>
        </div>
        <div>
          <div className="font-medium text-navy">For a clear file</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Use daylight and avoid glare on the photo.</li>
            <li>All four corners and all the text must be visible.</li>
            <li>The ID must still be valid (not expired).</li>
            <li>Use your real ID only. Only OXL staff can open it; other businesses and lenders never see it.</li>
          </ul>
        </div>
      </div>
    </details>
  )
}

export default function IdentityCard({ org }) {
  const [req, setReq] = useState(null)
  const [docs, setDocs] = useState([])
  const [f, setF] = useState({ holder_name: '', holder_role: ROLES[0], file: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const load = () => {
    supabase.rpc('identity_requirement', { p_org: org.id }).then(({ data }) => setReq(data?.[0] ?? null))
    supabase.from('documents').select('*').eq('org_id', org.id).in('doc_type', ['national_id', 'representative_id'])
      .order('created_at', { ascending: false }).then(({ data }) => setDocs(data ?? []))
  }
  useEffect(() => { load() }, [org.id]) // eslint-disable-line
  if (!req) return null
  const reps = req.kind === 'representatives'

  async function upload(e) {
    e.preventDefault(); if (!f.file) return
    setBusy(true); setErr(null)
    try {
      const path = `${org.id}/identity/${crypto.randomUUID()}-${f.file.name.replace(/[^\w.-]+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, f.file)
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      const { data: doc, error } = await supabase.from('documents').insert({
        org_id: org.id, doc_type: req.doc_type, file_name: f.file.name, storage_path: path, uploaded_by: user.id,
        holder_name: reps ? f.holder_name.trim() : null, holder_role: reps ? f.holder_role : null,
      }).select().single()
      if (error) throw error
      setF({ holder_name: '', holder_role: ROLES[0], file: null }); setFormKey((k) => k + 1); load()
      supabase.functions.invoke('extract-document', { body: { document_id: doc.id } }).finally(load)
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  const done = req.approved >= req.required
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold">Identity documents</h3>
          <p className="text-sm text-navy/60">{reps
            ? 'Upload the national ID or passport of two directors or representatives. OXL raises your trust level only after checking them.'
            : 'Upload your national ID or passport. OXL raises your trust level only after checking it.'} Lenders and other businesses never see these files.</p></div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${done ? 'bg-leaf/10 text-leaf' : 'bg-amber-100 text-amber-800'}`}>
          {req.approved} of {req.required} approved{req.uploaded > req.approved ? ` · ${req.uploaded - req.approved} waiting` : ''}</span>
      </div>
      {docs.map((d) => <DocCard key={d.id} d={d} />)}
      {req.uploaded < req.required || reps ? (
        <form key={formKey} onSubmit={upload} className="grid gap-3 rounded-lg bg-cream p-4 sm:grid-cols-3">
          <b className="sm:col-span-3 text-sm">Add {DOC_LABEL[req.doc_type].toLowerCase()}</b>
          {reps && <>
            <div><label className="label">Full name on the ID</label><input className="input" required value={f.holder_name} onChange={(e) => setF({ ...f, holder_name: e.target.value })} /></div>
            <div><label className="label">Role</label><select className="input" value={f.holder_role} onChange={(e) => setF({ ...f, holder_role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          </>}
          <div className={reps ? '' : 'sm:col-span-2'}>
            <label className="label">Photo or scan of the ID (front and back)</label>
            <input type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp" className="text-sm" onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null })} />
            <p className="mt-1 text-xs text-navy/60">Upload <b>one file</b> that shows <b>both sides</b>: a PDF with two pages, or one image with the front and the back. A passport needs only the photo page. PDF, JPG, PNG or WebP.</p>
          </div>
          <ScanHelp />
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || !f.file}>{busy ? 'Uploading…' : 'Upload'}</button>
            <span className="text-xs text-navy/50">OXL's AI reads only the name, the type of document, its expiry and the last 4 characters of the number.</span>
          </div>
          {err && <p className="sm:col-span-3 text-sm text-red-700">{err}</p>}
        </form>
      ) : null}
    </section>
  )
}
