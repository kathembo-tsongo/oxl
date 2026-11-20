// Shared page furniture: a header with title and description, summary tiles, an empty state and a letter avatar.
// Presentation only; pages keep their own data and logic.

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
      <div className="min-w-0">
        <h2 className="text-3xl font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-navy/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const DOT = { ok: 'bg-leaf', warn: 'bg-gold', bad: 'bg-coral', none: 'bg-navy/25' }

// A number with a plain label. The dot says whether it needs attention: green fine, gold waiting, coral problem.
export function StatTile({ label, value, hint, tone = 'none' }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-[13px] font-medium text-navy/70">
        <span className={`h-2 w-2 rounded-full ${DOT[tone] ?? DOT.none}`} aria-hidden="true" />{label}
      </div>
      <div className="mt-2 font-serif text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-navy/60">{hint}</div>}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-leaf/10 text-leaf" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <div className="mt-3 font-medium">{title}</div>
      {children && <p className="mt-1 max-w-sm text-sm text-navy/70">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// The letter circle takes one of the four logo colours, always the same one for the same name
const TINTS = ['bg-navy/10 text-navy', 'bg-coral/15 text-coral-ink', 'bg-leaf/15 text-leaf', 'bg-gold/25 text-gold-ink']
export function Avatar({ name, size = 36 }) {
  const n = (name ?? '?').trim()
  const tint = TINTS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-serif font-semibold ${tint}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {n[0]?.toUpperCase()}
    </span>
  )
}
