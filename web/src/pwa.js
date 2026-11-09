// Phone app (PWA) support: registers the service worker and exposes the browser's install prompt.
import { useEffect, useState } from 'react'

export function registerServiceWorker() {
  // Only in the built app: in development a cached app shell would hide code changes
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
}

let deferredPrompt = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; listeners.forEach((f) => f(true)) })
  window.addEventListener('appinstalled', () => { deferredPrompt = null; listeners.forEach((f) => f(false)) })
}

// Returns [canInstall, install]
export function useInstallPrompt() {
  const [can, setCan] = useState(!!deferredPrompt)
  useEffect(() => { listeners.add(setCan); return () => listeners.delete(setCan) }, [])
  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    setCan(false)
  }
  return [can, install]
}
