import { NavLink } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase, ROLE_LABEL } from '../supabase'
import { TierBadge } from './Badges'

export default function Layout({ children }) {
  const { org, isAdmin } = useAuth()
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
            {isAdmin && <NavLink to="/admin" className={link}>Verification</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {org && <span className="hidden sm:inline text-white/80">{org.name} · {ROLE_LABEL[org.role]}</span>}
            {org && <TierBadge tier={org.verification_tier} dark />}
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
