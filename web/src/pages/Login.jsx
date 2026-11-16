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
    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      setBusy(false)
      setMsg(error ? { err: true, text: error.message } : { text: 'If this email has an OXL account, a link to choose a new password is on its way.' })
      return
    }
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
        <h1 className="text-4xl font-semibold leading-tight">Verified trade partners and finance for African businesses.</h1>
        <p className="mt-4 text-white/70 max-w-md">OXL matches sellers and buyers across borders, verifies who they are, and gives financiers a clear risk picture. Now in Kenya and Ghana.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-semibold">{{ signin: 'Sign in', signup: 'Create an account', reset: 'Reset your password' }[mode]}</h2>
          <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== 'reset' && <div><label className="label">Password</label><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
          {mode === 'signin' && <button type="button" className="-mt-2 text-xs text-navy/60 hover:text-navy" onClick={() => { setMode('reset'); setMsg(null) }}>Forgot your password?</button>}
          {msg && <p className={`text-sm ${msg.err ? 'text-red-700' : 'text-leaf'}`}>{msg.text}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Sign up', reset: 'Send reset link' }[mode]}</button>
          <p className="text-sm text-navy/60">
            {mode === 'signin' ? 'New to OXL? ' : 'Already registered? '}
            <button type="button" className="text-terra font-medium" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null) }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
