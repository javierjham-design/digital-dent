'use client'

import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
//  PWASetup
// ─────────────────────────────────────────────────────────────────────────────
//
//  1. Registra el service worker `/sw.js` en cuanto se monta el dashboard.
//  2. Escucha el evento `beforeinstallprompt` (Chrome/Edge/Brave en Android y
//     Desktop) y muestra un banner discreto invitando a instalar la app.
//  3. En iOS no existe ese evento. Si detectamos Safari móvil + sesión nueva,
//     mostramos un banner explicando cómo instalar manualmente.
//  4. Si la app YA está instalada (`display-mode: standalone`), no muestra nada.
//
//  El banner es dismissable y guarda el estado en localStorage.

type InstalledEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const LS_DISMISS = 'clariva.pwa.install-dismissed'

export function PWASetup() {
  const [evento, setEvento] = useState<InstalledEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [oculto, setOculto] = useState(true)

  // 1) Registrar service worker.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // No registramos en localhost para evitar dolores de cabeza en dev.
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Falla silenciosa: el sitio sigue funcionando sin SW.
    })
  }, [])

  // 2) Detectar capacidad de instalación.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const yaDismiss = localStorage.getItem(LS_DISMISS) === '1'
    const yaInstalado =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS specific
      window.navigator.standalone === true

    if (yaInstalado || yaDismiss) {
      setOculto(true)
      return
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setEvento(e as InstalledEvent)
      setOculto(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // Detectar iOS Safari (donde no existe beforeinstallprompt).
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua)
    if (isIOS && isSafari) {
      // Esperamos 4s para no interrumpir al usuario apenas entra.
      const t = setTimeout(() => {
        setIosHint(true)
        setOculto(false)
      }, 4000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    const { outcome } = await evento.userChoice
    if (outcome === 'accepted') {
      setOculto(true)
    } else {
      // Si rechazó, no insistimos.
      localStorage.setItem(LS_DISMISS, '1')
      setOculto(true)
    }
  }

  const cerrar = () => {
    localStorage.setItem(LS_DISMISS, '1')
    setOculto(true)
  }

  if (oculto) return null

  return (
    <div
      role="region"
      aria-label="Instalar Cláriva"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[60] bg-white border border-cyan-200 shadow-lg rounded-2xl p-4 flex gap-3 items-start"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold flex items-center justify-center text-lg shrink-0">
        C
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">Instalar Cláriva</p>
        {iosHint ? (
          <p className="text-xs text-slate-600 mt-0.5">
            Tocá <span className="font-semibold">Compartir</span> →{' '}
            <span className="font-semibold">Agregar a inicio</span> para abrir
            Cláriva como app desde tu pantalla.
          </p>
        ) : (
          <p className="text-xs text-slate-600 mt-0.5">
            Tené acceso rápido desde tu pantalla de inicio. Sin pasar por el navegador.
          </p>
        )}
        {!iosHint && (
          <button
            type="button"
            onClick={instalar}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium"
          >
            Instalar app
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={cerrar}
        className="text-slate-400 hover:text-slate-600 shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
