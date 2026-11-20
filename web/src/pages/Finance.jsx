import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, FINANCE_TYPE_LABEL } from '../supabase'
import { useAuth } from '../App'
import { PageHeader, EmptyState } from '../components/Page'

const EMPTY = { amount: '', purpose: '', finance_type: '', hs_code: '', destination_country: '', repay_days: '' }

export default function Finance() {
  const { org } = useAuth()
  const [rows, setRows] = useState([])
  const [commodities, setCommodities] = useState([])
  const [countries, setCountries] = useState([])
  const [f, setF] = useState(EMPTY)
  const [err, setErr] = useState(null)
  const load = () => supabase.from('finance_requests').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  useEffect(() => {
    load()
    supabase.from('commodities').select('hs_code, name').order('name').then(({ data }) => setCommodities(data ?? []))
    supabase.from('countries').select('code, name').order('name').then(({ data }) => setCountries(data ?? []))
  }, [org.id]) // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const productName = (hs) => commodities.find((c) => c.hs_code === hs)?.name ?? hs
  const countryName = (code) => countries.find((c) => c.code === code)?.name ?? code
  // Offer the business's own products first
  const mine = commodities.filter((c) => (org.hs_codes ?? []).includes(c.hs_code))
  const others = commodities.filter((c) => !(org.hs_codes ?? []).includes(c.hs_code))
  async function save(e) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.from('finance_requests').insert({
      org_id: org.id, amount_usd: Number(f.amount), purpose: f.purpose,
      finance_type: f.finance_type || null, hs_code: f.hs_code || null,
      destination_country: f.destination_country || null, repay_days: f.repay_days ? Number(f.repay_days) : null,
    })
    if (error) setErr(error.message); else { setF(EMPTY); load() }
  }
  return (
    <div className="space-y-6">
    <PageHeader title="Finance" subtitle="Ask financiers on OXL for trade finance. They see your request, trust level and country; your full risk report only if you share it." />
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={save} className="card h-fit space-y-3">
        <h2 className="text-xl font-semibold">Request trade finance</h2>
        <p className="text-xs text-navy/60">Lenders pick requests that fit what they finance, so the more you say, the better the match. To let them see your full risk report, <Link className="text-terra" to={`/report/${org.id}`}>choose who can see it</Link>.</p>
        <div><label className="label">What kind of finance?</label>
          <select className="input" value={f.finance_type} onChange={set('finance_type')}>
            <option value="">Choose…</option>
            {Object.entries(FINANCE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          {f.finance_type && <p className="mt-1 text-xs text-navy/60">{FINANCE_TYPE_LABEL[f.finance_type].hint}</p>}</div>
        <div><label className="label">Amount (USD)</label><input className="input" type="number" min="1" required value={f.amount} onChange={set('amount')} /></div>
        <div><label className="label">Product</label>
          <select className="input" value={f.hs_code} onChange={set('hs_code')}>
            <option value="">Not product-specific</option>
            {mine.length > 0 && <optgroup label="Your products">{mine.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name}</option>)}</optgroup>}
            <optgroup label={mine.length ? 'All products' : 'Products'}>{others.map((c) => <option key={c.hs_code} value={c.hs_code}>{c.name}</option>)}</optgroup>
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Goods go to</label>
            <select className="input" value={f.destination_country} onChange={set('destination_country')}>
              <option value="">Not sure yet</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select></div>
          <div><label className="label">Repay within (days)</label><input className="input" type="number" min="1" max="1095" value={f.repay_days} onChange={set('repay_days')} placeholder="e.g. 90" /></div>
        </div>
        <div><label className="label">Purpose</label><textarea className="input" rows={3} required value={f.purpose} onChange={set('purpose')} placeholder="e.g. Pre-export finance for 30 t cocoa to Nairobi" /></div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full">Submit request</button>
      </form>
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Your requests</h2>
        {rows.length === 0 && <EmptyState neutral title="No requests yet">Submit your first request on the left.</EmptyState>}
        {rows.map((r) => (
          <div key={r.id} className="card flex items-center gap-4">
            <div className="font-serif text-xl font-semibold tabular-nums">${Number(r.amount_usd).toLocaleString()}</div>
            <div className="flex-1 text-sm">
              <div>{r.purpose}</div>
              <div className="mt-1 text-xs text-navy/60">{[r.finance_type && FINANCE_TYPE_LABEL[r.finance_type]?.name, r.hs_code && productName(r.hs_code), r.destination_country && `to ${countryName(r.destination_country)}`, r.repay_days && `${r.repay_days} days`].filter(Boolean).join(' · ')}</div>
            </div>
            <div className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${r.status === 'open' ? 'bg-gold/25 text-gold-ink' : 'bg-navy/10 text-navy'}`}>{r.status}</div>
          </div>
        ))}
      </div>
    </div>
    </div>
  )
}
