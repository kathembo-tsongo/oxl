// Emails unsent notifications through Resend. Called on a schedule with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403)
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ error: 'RESEND_API_KEY is not set' }, 500)
  const from = Deno.env.get('ALERT_FROM') ?? 'OXL <onboarding@resend.dev>'
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('pending_email_alerts', { p_limit: 200 })
  if (error) return json({ error: error.message }, 500)

  const done = new Set<string>()
  const failures: string[] = []
  let sent = 0
  for (const r of (data ?? []) as { notification_id: string; to_email: string; title: string; body: string | null; link: string | null }[]) {
    const url = appUrl ? appUrl + (r.link ?? '/') : null
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1C2B4A">
      <p style="font-size:18px;font-weight:bold">${esc(r.title)}</p>
      ${r.body ? `<p>${esc(r.body)}</p>` : ''}
      ${url ? `<p><a href="${esc(url)}" style="background:#A3472A;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open OXL</a></p>` : ''}
      <p style="font-size:12px;color:#6b7280">You are receiving this because you have an OXL account.</p></div>`
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [r.to_email], subject: r.title, html }),
      })
      if (res.ok) { sent++; done.add(r.notification_id) }
      else if (res.status < 500) { failures.push(`${res.status}: ${(await res.text()).slice(0, 200)}`); done.add(r.notification_id) } // permanent: do not retry forever
      else failures.push(`${res.status}`) // temporary: retry on the next run
    } catch (e) { failures.push(String(e)) }
  }
  if (done.size) await admin.rpc('mark_alerts_sent', { p_ids: [...done] })
  return json({ sent, failures })
})
