import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase, ROLE_LABEL } from '../supabase'
import { TierBadge } from './Badges'
import { useInstallPrompt } from '../pwa'
import { LogoMark } from './Logo'

// Top bar: the business's own pages. Staff get a second bar of OXL tools underneath, so the two never mix.
const STAFF_LINKS = [
  ['/admin', 'Verification', true],
  ['/admin/reference', 'Reference data'],
  ['/admin/prospects', 'Prospects'],
  ['/admin/oversight', 'Oversight'],
  ['/admin/safety', 'Safety'],
  ['/admin/staff', 'Staff'],
]

export default function Layout({ children }) {
  const { org, isAdmin } = useAuth()
  const [canInstall, install] = useInstallPrompt()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!org) return
    const count = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).then(({ count: c }) => setUnread(c ?? 0))
    count()
    const timer = setInterval(count, 60000)
    window.addEventListener('oxl-notifications', count)
    return () => { clearInterval(timer); window.removeEventListener('oxl-notifications', count) }
  }, [org])
  const trader = org && ['exporter', 'importer'].includes(org.role)

  const main = [
    org && ['/', 'Dashboard', true],
    ['/database', 'Database'],
    org && ['/documents', 'Documents'],
    trader && ['/finance', 'Finance'],
    org && ['/profile', 'Profile'],
  ].filter(Boolean)

  const link = ({ isActive }) => `relative whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${isActive
    ? 'text-white after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-terra-light'
    : 'text-white/75 hover:text-white'}`
  const staffLink = ({ isActive }) => `whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition-colors ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`
  const nav = (items) => items.map(([to, label, end]) => <NavLink key={to} to={to} end={!!end} className={link}>{label}</NavLink>)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-navy text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 py-3" aria-label="OXL home">
            <LogoMark size={26} variant="dark" />
            <span className="font-serif text-lg font-bold tracking-[0.04em]">OXL</span>
          </Link>
          <nav className="hidden items-center gap-0.5 self-stretch md:flex" aria-label="Main">{nav(main)}</nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {org ? (
              <div className="hidden items-center gap-2.5 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 font-serif text-sm font-semibold" aria-hidden="true">{org.name?.[0]?.toUpperCase()}</span>
                <span className="hidden leading-tight lg:block">
                  <span className="block max-w-[11rem] truncate font-medium">{org.name}</span>
                  <span className="block text-xs text-white/70">{ROLE_LABEL[org.role]}</span>
                </span>
                <TierBadge tier={org.verification_tier} dark />
              </div>
            ) : isAdmin && <span className="hidden rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium sm:inline">OXL staff</span>}
            {org && (
              <Link to="/notifications" className="relative rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-terra px-1.5 text-[10px] font-semibold leading-4 text-white ring-2 ring-navy">{unread > 9 ? '9+' : unread}</span>}
              </Link>
            )}
            {canInstall && <button className="rounded-md bg-terra px-3 py-1.5 text-white hover:bg-terra/90" onClick={install}>Install app</button>}
            <button className="rounded-md px-2.5 py-1.5 text-white/75 hover:bg-white/10 hover:text-white" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
        {/* Phone: the same links in a row that scrolls sideways instead of wrapping */}
        <nav className="mx-auto flex max-w-6xl gap-0.5 overflow-x-auto px-3 md:hidden" aria-label="Main (phone)">{nav(main)}</nav>
        {isAdmin && (
          <div className="border-t border-white/10 bg-navy-deep">
            <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-1.5" aria-label="OXL staff">
              <span className="mr-2 shrink-0 text-xs text-white/60">OXL staff</span>
              {STAFF_LINKS.map(([to, label, end]) => <NavLink key={to} to={to} end={!!end} className={staffLink}>{label}</NavLink>)}
            </nav>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-navy/60">
          <span className="flex items-center gap-2"><LogoMark size={16} /> OXL Trade Facilitation Platform</span>
          <span>Verified trade partners and finance across Kenya and Ghana</span>
        </div>
      </footer>
    </div>
  )
}
