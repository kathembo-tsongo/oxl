// The top of every business's dashboard: who they are, how far OXL has verified them, and what to do next.
// Presentation only. It reads the signed-in organisation and changes no data.
import { Link } from 'react-router-dom'
import { useAuth } from '../App'
import { ROLE_LABEL, TIER_LABEL } from '../supabase'
import { LogoMark } from './Logo'

const ORDER = ['self_declared', 'documents_checked', 'registry_checked', 'field_verified']
// The four logo colours, one per trust level
const STEP = ['rgba(255,255,255,0.7)', '#E2A33B', '#C2583A', '#5DB07E']
const NEXT = {
  self_declared: 'Next level: Documents checked. Upload your ID and registration documents.',
  documents_checked: 'Next level: Registry checked. OXL confirms your registration with the official registry.',
  registry_checked: 'Next level: Field verified. An OXL field officer visits your business.',
  field_verified: 'Top level reached. Buyers and lenders see you as fully verified.',
}

export default function DashboardBanner() {
  const { org } = useAuth()
  if (!org) return null
  const level = Math.max(0, ORDER.indexOf(org.verification_tier))
  const top = level === ORDER.length - 1
  const place = [org.city, org.country].filter(Boolean).join(', ')

  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-[#182544] to-navy-deep text-white shadow-lift" aria-label="Your account">
      <LogoMark size={400} variant="dark" className="pointer-events-none absolute -right-32 -top-36 hidden opacity-[0.2] sm:block" />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div>
          <p className="text-sm text-white/70">Welcome back</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">{org.name}</h1>
          <p className="mt-2 text-white/75">{ROLE_LABEL[org.role]}{place ? ` · ${place}` : ''}</p>
          {!top && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              {level < 2 && <Link to="/documents" className="inline-flex items-center rounded-lg bg-terra px-4 py-2.5 text-sm font-medium text-white shadow-sm ring-1 ring-white/25 transition hover:bg-[#8F3D23]">Upload documents</Link>}
              <Link to="/profile" className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/35 transition hover:bg-white/10">{level < 2 ? 'Complete your profile' : 'Review your profile'}</Link>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-navy-deep/80 p-5 ring-1 ring-white/15">
          <p className="text-sm font-medium">Your trust level</p>
          <p className="mt-1 text-xs leading-relaxed text-white/75">{NEXT[org.verification_tier] ?? NEXT.self_declared}</p>
          <ol className="mt-5 grid grid-cols-4 items-end gap-2" aria-label="Trust levels, lowest to highest">
            {ORDER.map((t, i) => (
              <li key={t} aria-current={i === level ? 'step' : undefined}>
                <div className="rounded-t-md" style={{ height: 16 + i * 12, background: i <= level ? STEP[i] : 'rgba(255,255,255,0.14)' }} />
                <span className={`mt-2 block text-[11px] leading-tight ${i === level ? 'font-semibold text-white' : 'text-white/60'}`}>{TIER_LABEL[t]}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
