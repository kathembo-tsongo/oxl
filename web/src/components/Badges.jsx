import { TIER_LABEL } from '../supabase'

const TIER_STYLE = {
  self_declared: 'bg-gray-100 text-gray-700',
  documents_checked: 'bg-amber-100 text-amber-900',
  registry_checked: 'bg-sky-100 text-sky-900',
  field_verified: 'bg-emerald-100 text-emerald-900',
}
const TIER_BAR = {
  self_declared: 'bg-gray-500',
  documents_checked: 'bg-amber-600',
  registry_checked: 'bg-sky-600',
  field_verified: 'bg-emerald-600',
}
const LEVEL = { self_declared: 1, documents_checked: 2, registry_checked: 3, field_verified: 4 }

// Four rising bars: the same four trust levels OXL uses everywhere, filled up to the business's level
function TrustBars({ tier, dark }) {
  const level = LEVEL[tier] ?? 1
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {[5, 7, 9, 11].map((h, i) => (
        <span key={h} className={`w-[3px] rounded-[1px] ${i < level ? (dark ? 'bg-white' : TIER_BAR[tier]) : (dark ? 'bg-white/30' : 'bg-black/15')}`} style={{ height: h }} />
      ))}
    </span>
  )
}

export function TierBadge({ tier, dark }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${dark ? 'bg-white/15 text-white' : TIER_STYLE[tier]}`}>
      <TrustBars tier={tier} dark={dark} />
      {TIER_LABEL[tier]}
    </span>
  )
}

// The "demo" label is no longer shown. Kept as a no-op so existing call sites still work.
export function DemoBadge() {
  return null
}

export function ScoreFactors({ factors }) {
  return (
    <ul className="space-y-1.5">
      {factors.map((f) => (
        <li key={f.factor} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-2 text-xs">
          <span className="text-navy/70">{f.factor}</span>
          <span className="relative h-1.5 rounded-full bg-line">
            <span className="absolute inset-y-0 left-0 rounded-full bg-leaf" style={{ width: `${(f.points / f.max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-navy/60">{f.points}/{f.max}</span>
          <span className="col-span-3 -mt-1 pl-[9rem] text-navy/55">{f.detail}</span>
        </li>
      ))}
    </ul>
  )
}

export function ScorePill({ score }) {
  const c = score >= 75 ? 'bg-leaf text-white' : score >= 50 ? 'bg-amber-600 text-white' : 'bg-gray-300 text-navy'
  return <span className={`inline-flex h-9 w-12 items-center justify-center rounded-lg text-sm font-semibold tabular-nums ${c}`}>{score}</span>
}
