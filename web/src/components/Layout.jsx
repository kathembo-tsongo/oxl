import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase, ROLE_LABEL } from '../supabase'
import { TierBadge } from './Badges'
import { useInstallPrompt } from '../pwa'
import { LogoMark } from './Logo'

// Left sidebar: the business's own pages first, then (for OXL staff) the staff tools in their own group.
const ICON = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  database: 'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6',
  documents: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  finance: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  verification: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3zM9 12l2 2 4-4',
  reference: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  prospects: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  oversight: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  safety: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  staff: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  install: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  signout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6 6 18M6 6l12 12',
}
function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d={ICON[name]} /></svg>
}

const STAFF_LINKS = [
  ['/admin', 'Verification', 'verification', true],
  ['/admin/reference', 'Reference data', 'reference'],
  ['/admin/prospects', 'Prospects', 'prospects'],
  ['/admin/oversight', 'Oversight', 'oversight'],
  ['/admin/safety', 'Safety', 'safety'],
  ['/admin/staff', 'Staff', 'staff'],
]

export default function Layout({ children }) {
  const { org, isAdmin } = useAuth()
  const [canInstall, install] = useInstallPrompt()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
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
    org && ['/', 'Dashboard', 'dashboard', true],
    ['/database', 'Database', 'database'],
    org && ['/documents', 'Documents', 'documents'],
    trader && ['/finance', 'Finance', 'finance'],
    org && ['/profile', 'Profile', 'profile'],
  ].filter(Boolean)

  const item = ({ isActive }) => `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive
    ? 'bg-white/12 font-medium text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gold'
    : 'text-white/75 hover:bg-white/8 hover:text-white'}`
  const links = (list) => list.map(([to, label, icon, end]) => (
    <NavLink key={to} to={to} end={!!end} className={item}><Icon name={icon} />{label}</NavLink>
  ))

  const panel = (
    <div className="flex h-full flex-col bg-gradient-to-b from-navy to-navy-deep text-white">
      <Link to="/" className="flex items-center gap-2.5 px-5 py-5" aria-label="OXL home">
        <LogoMark size={30} variant="dark" />
        <span className="font-serif text-xl font-bold tracking-[0.04em]">OXL</span>
      </Link>

      {org ? (
        <div className="mx-3 rounded-xl bg-white/8 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 font-serif text-base font-semibold" aria-hidden="true">{org.name?.[0]?.toUpperCase()}</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium">{org.name}</span>
              <span className="block text-xs text-white/70">{ROLE_LABEL[org.role]}</span>
            </span>
          </div>
          <div className="mt-2.5"><TierBadge tier={org.verification_tier} dark /></div>
        </div>
      ) : isAdmin && (
        <div className="mx-3 rounded-xl bg-white/8 px-3 py-2.5 text-sm ring-1 ring-white/10">OXL staff account</div>
      )}

      <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {links(main)}
        {isAdmin && (
          <>
            <div className="mx-3 mb-1 mt-6 border-t border-white/10 pt-4 text-xs font-medium text-white/60">OXL staff</div>
            {links(STAFF_LINKS)}
          </>
        )}
      </nav>

      <div className="space-y-0.5 border-t border-white/10 px-3 py-3">
        {org && (
          <NavLink to="/notifications" className={item}>
            <Icon name="bell" />Notifications
            {unread > 0 && <span className="ml-auto rounded-full bg-terra px-1.5 text-[11px] font-semibold leading-5 text-white">{unread > 9 ? '9+' : unread}</span>}
          </NavLink>
        )}
        {canInstall && <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/8 hover:text-white" onClick={install}><Icon name="install" />Install app</button>}
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/8 hover:text-white" onClick={() => supabase.auth.signOut()}><Icon name="signout" />Sign out</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{panel}</aside>

      {/* Phone and tablet: slim top bar that opens the same sidebar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-navy px-4 py-2.5 text-white lg:hidden">
        <button className="-ml-1.5 rounded-md p-1.5 hover:bg-white/10" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Icon name="menu" size={22} /></button>
        <Link to="/" className="flex items-center gap-2" aria-label="OXL home"><LogoMark size={24} variant="dark" /><span className="font-serif text-lg font-bold tracking-[0.04em]">OXL</span></Link>
        {org && (
          <Link to="/notifications" className="relative ml-auto rounded-md p-1.5 hover:bg-white/10" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Icon name="bell" size={20} />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-terra px-1.5 text-[10px] font-semibold leading-4 text-white ring-2 ring-navy">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        )}
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-navy-deep/60" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-lift">
            {panel}
            <button className="absolute right-2 top-3 rounded-md p-1.5 text-white/80 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close" size={20} /></button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-navy/60 sm:px-6 lg:px-8">
            <span className="flex items-center gap-2"><LogoMark size={16} /> OXL Trade Facilitation Platform</span>
            <span>Verified trade partners and finance across Kenya and Ghana</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
