import { TIER_LABEL } from '../supabase'

const TIER_STYLE = {
  self_declared: 'bg-gray-100 text-gray-700',
  documents_checked: 'bg-amber-100 text-amber-800',
  registry_checked: 'bg-sky-100 text-sky-800',
  field_verified: 'bg-emerald-100 text-emerald-800',
}

export function TierBadge({ tier, dark }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${dark ? 'bg-white/15 text-white' : TIER_STYLE[tier]}`}>
      {tier === 'field_verified' ? '✓ ' : ''}{TIER_LABEL[tier]}
    </span>
  )
}

export function DemoBadge({ show }) {
  if (!show) return null
  return <span className="rounded-full bg-terra/10 px-2 py-0.5 text-xs font-medium text-terra">demo</span>
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
  const c = score >= 75 ? 'bg-leaf text-white' : score >= 50 ? 'bg-amber-500 text-white' : 'bg-gray-300 text-navy'
  return <span className={`inline-flex h-9 w-12 items-center justify-center rounded-lg text-sm font-semibold tabular-nums ${c}`}>{score}</span>
}
