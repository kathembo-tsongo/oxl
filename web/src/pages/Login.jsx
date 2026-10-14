import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { error, data } = await fn.call(supabase.auth, { email, password })
    setBusy(false)
    if (error) setMsg({ err: true, text: error.message })
    else if (mode === 'signup' && !data.session) setMsg({ text: 'Check your email to confirm your account, then sign in.' })
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-end bg-navy p-12 text-white">
        <svg width="56" height="56" viewBox="0 0 32 32" className="mb-8"><path d="M16 4 28 16 16 28 4 16z" fill="#A3472A" /></svg>
        <h1 className="text-4xl font-semibold leading-tight">Verified trade partners and finance for African agribusiness.</h1>
        <p className="mt-4 text-white/70 max-w-md">OXL matches exporters and importers, verifies who they are, and gives financiers a clear risk picture. Pilot: Kenya and Ghana.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-semibold">{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>
          <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label">Password</label><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.text}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}</button>
          <p className="text-sm text-navy/60">
            {mode === 'signin' ? 'New to OXL? ' : 'Already registered? '}
            <button type="button" className="text-terra font-medium" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
