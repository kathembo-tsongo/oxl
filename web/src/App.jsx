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
import Invite from './pages/Invite'
import Notifications from './pages/Notifications'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null)
  const [org, setOrg] = useState(null)
  const location = useLocation()

  const refresh = useCallback(async (s) => {
    const uid = s?.user?.id
    if (!uid) { setProfile(null); setOrg(null); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(p)
    if (p?.org_id) {
      const { data: o } = await supabase.from('organisations').select('*').eq('id', p.org_id).single()
      setOrg(o)
    } else setOrg(null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { await refresh(data.session); setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); refresh(s) })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  // Invitation links work whether or not the visitor is signed in
  if (location.pathname.startsWith('/invite/')) return <Routes><Route path="/invite/:token" element={<Invite />} /></Routes>
  if (session === undefined) return <div className="p-10 text-navy/60">Loading…</div>
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>

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
            <Route path="/report/:orgId" element={<RiskReport />} />
            <Route path="/documents" element={org ? <Documents /> : <Navigate to="/admin" />} />
            <Route path="/finance" element={org ? <Finance /> : <Navigate to="/admin" />} />
            <Route path="/profile" element={org ? <Profile /> : <Navigate to="/admin" />} />
            {isAdmin && <Route path="/admin" element={<Admin />} />}
            {isAdmin && <Route path="/admin/reference" element={<AdminReference />} />}
            {isAdmin && <Route path="/admin/prospects" element={<AdminProspects />} />}
            <Route path="/notifications" element={org ? <Notifications /> : <Navigate to="/admin" />} />
            {org?.role === 'agent' && <Route path="/clients/:orgId" element={<ClientWorkspace />} />}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      )}
    </AuthCtx.Provider>
  )
}
