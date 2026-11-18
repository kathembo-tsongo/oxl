import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Directory from './pages/Directory'
import RiskReport from './pages/RiskReport'
import Documents from './pages/Documents'
import Admin from './pages/Admin'
import Finance from './pages/Finance'
import Profile from './pages/Profile'
import ClientWorkspace from './pages/ClientWorkspace'
import AdminReference from './pages/AdminReference'
import AdminProspects from './pages/AdminProspects'
import AdminSafety from './pages/AdminSafety'
import AdminOversight from './pages/AdminOversight'
import Invite from './pages/Invite'
import Notifications from './pages/Notifications'
import { MfaChallenge, MfaRequired, NewPassword } from './components/Security'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null)
  const [org, setOrg] = useState(null)
  const [aal, setAal] = useState(null)              // { currentLevel, nextLevel } from two-step sign-in
  const [adminMfa, setAdminMfa] = useState(true)    // settings.admin_requires_mfa
  const [recovery, setRecovery] = useState(false)   // arrived from a password-reset email
  const location = useLocation()

  const refresh = useCallback(async (s) => {
    const uid = s?.user?.id
    if (!uid) { setProfile(null); setOrg(null); setAal(null); return }
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setAal(level ?? { currentLevel: 'aal1', nextLevel: 'aal1' })
    const { data: st } = await supabase.from('settings').select('value').eq('key', 'admin_requires_mfa').maybeSingle()
    setAdminMfa(st ? String(st.value) !== 'false' : true)
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(p)
    if (p?.org_id) {
      const { data: o } = await supabase.from('organisations').select('*').eq('id', p.org_id).single()
      setOrg(o)
    } else setOrg(null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { await refresh(data.session); setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      setTimeout(() => refresh(s), 0) // outside the auth callback, as Supabase advises
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  // Invitation links work whether or not the visitor is signed in
  if (location.pathname.startsWith('/invite/')) return <Routes><Route path="/invite/:token" element={<Invite />} /></Routes>
  if (session === undefined) return <div className="p-10 text-navy/60">Loading…</div>
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />
  if (!aal) return <div className="p-10 text-navy/60">Loading…</div>
  // Account has an authenticator app but this session has only the password: ask for the code
  if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') return <MfaChallenge onDone={() => refresh(session)} />
  // OXL staff must set up two-step sign-in first
  if (profile?.is_oxl_admin && adminMfa && aal.currentLevel !== 'aal2') return <MfaRequired onDone={() => refresh(session)} />

  const isAdmin = !!profile?.is_oxl_admin
  const ctx = { session, profile, org, isAdmin, refresh: () => refresh(session) }

  return (
    <AuthCtx.Provider value={ctx}>
      {!org && !isAdmin ? (
        <Routes><Route path="*" element={<Onboarding />} /></Routes>
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={isAdmin && !org ? <Navigate to="/admin" /> : <Dashboard />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/database" element={<Directory />} />
            <Route path="/report/:orgId" element={<RiskReport />} />
            <Route path="/documents" element={org ? <Documents /> : <Navigate to="/admin" />} />
            <Route path="/finance" element={org ? <Finance /> : <Navigate to="/admin" />} />
            <Route path="/profile" element={org ? <Profile /> : <Navigate to="/admin" />} />
            {isAdmin && <Route path="/admin" element={<Admin />} />}
            {isAdmin && <Route path="/admin/reference" element={<AdminReference />} />}
            {isAdmin && <Route path="/admin/prospects" element={<AdminProspects />} />}
            {isAdmin && <Route path="/admin/safety" element={<AdminSafety />} />}
            {isAdmin && <Route path="/admin/oversight" element={<AdminOversight />} />}
            <Route path="/notifications" element={org ? <Notifications /> : <Navigate to="/admin" />} />
            {org?.role === 'agent' && <Route path="/clients/:orgId" element={<ClientWorkspace />} />}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      )}
    </AuthCtx.Provider>
  )
}
