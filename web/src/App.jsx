import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
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

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null)
  const [org, setOrg] = useState(null)

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
            {isAdmin && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      )}
    </AuthCtx.Provider>
  )
}
