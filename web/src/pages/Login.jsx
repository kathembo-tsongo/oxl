import { useState } from 'react'
import { supabase } from '../supabase'
import TradeMap from '../components/TradeMap'

const POINTS = [
  { t: 'Verified partners', d: 'Identity and documents checked, with a trust level you can see.', i: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3zm-3 9l2 2 4-4' },
  { t: 'Matched on route and timing', d: 'Only offers that can reach the buyer in time are shown.', i: 'M5 19a2 2 0 100-4 2 2 0 000 4zm14-10a2 2 0 100-4 2 2 0 000 4zM7 17h6a3 3 0 000-6h-2a3 3 0 010-6h6' },
  { t: 'A clear risk picture for lenders', d: 'Financiers see who they are lending to, before they decide.', i: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
]
const GOODS = ['Cocoa', 'Coffee', 'Tea', 'Cashew', 'Shea', 'Sesame', 'Copper']

const Logo = ({ size = 32 }) => <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 28 16 16 28 4 16z" fill="#C2583A" /></svg>

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
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
    <div className="min-h-dvh md:grid md:grid-cols-[1.15fr_1fr]">
      {/* Phone: short banner */}
      <header className="bg-gradient-to-br from-navy to-[#0f182b] px-6 py-7 text-white md:hidden">
        <div className="flex items-center gap-2"><Logo size={26} /><span className="text-lg font-semibold tracking-wide">OXL</span></div>
        <h1 className="mt-4 text-2xl font-semibold leading-snug">Verified trade partners and finance for African businesses.</h1>
      </header>

      {/* Desktop: story panel with the trade map */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-[#17233f] to-[#0c1426] text-white md:flex md:flex-col md:justify-between">
        <TradeMap className="pointer-events-none absolute -right-28 top-1/2 h-[118%] -translate-y-1/2 opacity-95" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#0c1426] via-[#0c1426]/80 to-transparent" />
        <div className="relative z-10 flex items-center gap-2 p-10 pb-0"><Logo /><span className="text-xl font-semibold tracking-wide">OXL</span></div>
        <div className="relative z-10 p-10 pt-0 xl:p-14 xl:pt-0">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight xl:text-5xl">Verified trade partners and finance for African businesses.</h1>
          <p className="mt-4 max-w-lg text-white/70">OXL matches sellers and buyers across borders, verifies who they are, and gives financiers a clear risk picture. Now in Kenya and Ghana.</p>
          <ul className="mt-7 grid max-w-xl gap-4">
            {POINTS.map((p) => (
              <li key={p.t} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F0A585" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={p.i} /></svg>
                </span>
                <span><span className="block font-medium">{p.t}</span><span className="block text-sm text-white/60">{p.d}</span></span>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-2">
            {GOODS.map((g) => <span key={g} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 ring-1 ring-white/15">{g}</span>)}
            <span className="rounded-full px-1 py-1 text-xs text-white/50">and more</span>
          </div>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-8 sm:p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <div>
            <h2 className="text-2xl font-semibold">{{ signin: 'Welcome back', signup: 'Create an account', reset: 'Reset your password' }[mode]}</h2>
            <p className="mt-1 text-sm text-navy/60">{{ signin: 'Sign in to your OXL account.', signup: 'Join verified exporters, importers, agents and lenders.', reset: 'We will email you a link to choose a new password.' }[mode]}</p>
          </div>
          <div><label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
          {mode !== 'reset' && (
            <div><label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input id="password" className="input pr-16" type={show ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-navy/60 hover:text-navy" aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
              </div>
              {mode === 'signup' && <p className="mt-1 text-xs text-navy/50">At least 8 characters.</p>}
            </div>
          )}
          {mode === 'signin' && <button type="button" className="-mt-1 text-xs text-navy/60 hover:text-navy" onClick={() => { setMode('reset'); setMsg(null) }}>Forgot your password?</button>}
          {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.err ? 'bg-red-50 text-red-700' : 'bg-leaf/10 text-leaf'}`}>{msg.text}</p>}
          <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Sign up', reset: 'Send reset link' }[mode]}</button>
          <p className="text-sm text-navy/60">
            {mode === 'signin' ? 'New to OXL? ' : 'Already registered? '}
            <button type="button" className="font-medium text-terra" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null) }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </main>
    </div>
  )
}
