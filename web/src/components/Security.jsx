// Sign-in security (Richmond, 13 Nov 2026: "What about authentication?")
// Two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…),
// required for OXL staff and optional for everyone else; password reset by email.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

const Msg = ({ m }) => (m ? <p className={`text-sm ${m.err ? 'text-red-700' : 'text-leaf'}`}>{m.err ?? m.ok}</p> : null)

// Add an authenticator app: scan the QR code, then type the 6-digit code to confirm
export function MfaEnrol({ onDone, onCancel }) {
  const [factor, setFactor] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return // React runs effects twice in development; set up only once
    started.current = true
    ;(async () => {
      // Clear half-finished set-ups so a new one can start
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `OXL ${new Date().toISOString().slice(0, 19)} ${Math.random().toString(36).slice(2, 6)}` })
      if (error) setMsg({ err: error.message }); else setFactor(data)
    })()
  }, [])
  async function verify(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    setBusy(false)
    if (error) setMsg({ err: 'That code did not work. Check the time on your phone and try the newest code.' })
    else { setMsg({ ok: 'Two-step sign-in is on.' }); onDone?.() }
  }
  return (
    <form onSubmit={verify} className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-navy/70">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).</li>
        <li>Add an account and scan this code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {factor ? (
        <div className="flex flex-wrap items-center gap-4">
          <img src={factor.totp.qr_code} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border border-line bg-white p-2" />
          <div className="min-w-0 text-xs"><div className="text-navy/60">Key</div><code className="break-all">{factor.totp.secret}</code></div>
        </div>
      ) : !msg && <p className="text-sm text-navy/60">Preparing…</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40"><label className="label">6-digit code</label>
          <input className="input tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        <button className="btn-primary" disabled={!factor || busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on'}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
      <Msg m={msg} />
    </form>
  )
}

// Second step at sign-in
export function MfaChallenge({ onDone }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  async function verify(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.[0]
    if (!factor) { setBusy(false); setMsg({ err: 'No authenticator app is set up for this account.' }); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    setBusy(false)
    if (error) setMsg({ err: 'That code did not work. Try the newest code in your app.' }); else onDone?.()
  }
  return (
    <AuthShell title="Two-step sign-in" text="Enter the 6-digit code from the authenticator app on your phone.">
      <form onSubmit={verify} className="space-y-3">
        <div><label className="label">6-digit code</label>
          <input className="input tracking-widest" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        <Msg m={msg} />
        <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" className="w-full text-sm text-navy/60" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </form>
    </AuthShell>
  )
}

// OXL staff must turn on two-step sign-in before they can use admin functions
export function MfaRequired({ onDone }) {
  return (
    <AuthShell title="Turn on two-step sign-in" text="OXL staff see identity documents and set trust levels, so the platform asks for a code from your phone as well as your password.">
      <MfaEnrol onDone={onDone} />
      <button type="button" className="mt-4 text-sm text-navy/60" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </AuthShell>
  )
}

// After following the reset link in the email
export function NewPassword({ onDone }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState(null)
  async function save(e) {
    e.preventDefault(); setMsg(null)
    if (pw !== pw2) { setMsg({ err: 'The two passwords are different.' }); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setMsg({ err: error.message }); else onDone?.()
  }
  return (
    <AuthShell title="Choose a new password" text="Use at least 8 characters.">
      <form onSubmit={save} className="space-y-3">
        <div><label className="label">New password</label><input className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label">Repeat it</label><input className="input" type="password" minLength={8} required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <Msg m={msg} />
        <button className="btn-primary w-full">Save password</button>
      </form>
    </AuthShell>
  )
}

function AuthShell({ title, text, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md space-y-4">
        <div className="flex items-center gap-2"><svg width="22" height="22" viewBox="0 0 32 32"><path d="M16 4 28 16 16 28 4 16z" fill="#A3472A" /></svg><span className="font-serif text-lg font-semibold">OXL</span></div>
        <div><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-1 text-sm text-navy/60">{text}</p></div>
        {children}
      </div>
    </div>
  )
}

// Profile card: turn two-step sign-in on or off
export function SecurityCard() {
  const [factors, setFactors] = useState(null)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState(null)
  const load = () => supabase.auth.mfa.listFactors().then(({ data }) => setFactors(data?.totp ?? []))
  useEffect(() => { load() }, [])
  async function remove(id) {
    setMsg(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    if (error) setMsg({ err: error.message }); else { setMsg({ ok: 'Two-step sign-in is off.' }); load() }
  }
  if (factors === null) return null
  return (
    <section className="card space-y-3">
      <div><h3 className="text-lg font-semibold">Sign-in security</h3>
        <p className="text-sm text-navy/60">Two-step sign-in asks for a code from your phone as well as your password, so nobody can use your account with your password alone.</p></div>
      {factors.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-leaf/10 px-2 py-0.5 text-xs font-medium text-leaf">On</span>
          <span className="flex-1">Authenticator app added {new Date(factors[0].created_at).toLocaleDateString()}</span>
          <button className="btn-ghost text-red-700" onClick={() => remove(factors[0].id)}>Turn off</button>
        </div>
      ) : adding ? (
        <MfaEnrol onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>Turn on two-step sign-in</button>
      )}
      <Msg m={msg} />
    </section>
  )
}
