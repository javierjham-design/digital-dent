'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
//  Sistema de toasts global de Cláriva
// ─────────────────────────────────────────────────────────────────────────────
//
//  API sin contexto (funciona desde cualquier client component):
//
//    import { toast } from '@/components/ui/Toaster'
//    toast.success('Cita agendada')
//    toast.error('No se pudo guardar')
//    toast.info('Sincronizando…')
//
//  El <Toaster /> se monta una vez en cada layout y escucha los eventos.

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  leaving?: boolean
}

const EVENT = 'clariva:toast'

function emit(kind: ToastKind, message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, message } }))
}

export const toast = {
  success: (message: string) => emit('success', message),
  error:   (message: string) => emit('error', message),
  info:    (message: string) => emit('info', message),
}

const KIND_STYLES: Record<ToastKind, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'bg-white border-emerald-200',
    icon: (
      <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    ),
  },
  error: {
    box: 'bg-white border-rose-200',
    icon: (
      <span className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    ),
  },
  info: {
    box: 'bg-white border-cyan-200',
    icon: (
      <span className="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    ),
  },
}

let nextId = 1

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    function onToast(e: Event) {
      const { kind, message } = (e as CustomEvent<{ kind: ToastKind; message: string }>).detail
      const id = nextId++
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }])
      // Salida suave a los 3.5s; remoción real 0.2s después.
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      }, 3500)
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 3700)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed top-[72px] right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium text-slate-800 transition-all duration-200',
            KIND_STYLES[t.kind].box,
            t.leaving ? 'opacity-0 translate-x-3' : 'opacity-100 translate-x-0',
          )}
        >
          {KIND_STYLES[t.kind].icon}
          <span className="min-w-0">{t.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            aria-label="Cerrar notificación"
            className="ml-1 text-slate-300 hover:text-slate-500 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
