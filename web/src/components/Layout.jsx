import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase, ROLE_LABEL } from '../supabase'
import { TierBadge } from './Badges'
import { useInstallPrompt } from '../pwa'

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
  const link = ({ isActive }) => `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:text-white'}`
  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-4">
            <svg width="22" height="22" viewBox="0 0 32 32"><path d="M16 4 28 16 16 28 4 16z" fill="#A3472A" /></svg>
            <span className="font-serif text-lg font-semibold">OXL</span>
          </div>
          <nav className="flex flex-wrap gap-1">
            {org && <NavLink to="/" end className={link}>Dashboard</NavLink>}
            <NavLink to="/directory" className={link}>Directory</NavLink>
            {org && <NavLink to="/documents" className={link}>Documents</NavLink>}
            {trader && <NavLink to="/finance" className={link}>Finance</NavLink>}
            {org && <NavLink to="/profile" className={link}>Profile</NavLink>}
            {isAdmin && <NavLink to="/admin" end className={link}>Verification</NavLink>}
            {isAdmin && <NavLink to="/admin/reference" className={link}>Reference data</NavLink>}
            {isAdmin && <NavLink to="/admin/prospects" className={link}>Prospects</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {org && <span className="hidden sm:inline text-white/80">{org.name} · {ROLE_LABEL[org.role]}</span>}
            {org && <TierBadge tier={org.verification_tier} dark />}
            {org && (
              <Link to="/notifications" className="relative text-white/80 hover:text-white" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                {unread > 0 && <span className="absolute -right-2 -top-1.5 rounded-full bg-terra px-1.5 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
              </Link>
            )}
            {canInstall && <button className="rounded-md bg-terra px-3 py-1 text-white hover:bg-terra/90" onClick={install}>Install app</button>}
            <button className="text-white/70 hover:text-white" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-navy/50">
        OXL Trade Facilitation Platform · MVP prototype · Kenya–Ghana pilot. Organisations marked “demo” are fictional.
      </footer>
    </div>
  )
}
