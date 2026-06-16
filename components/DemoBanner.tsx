'use client'

import { useState } from 'react'

// Banner persistente que avisa al prospecto que está en una demo y lo invita
// a contratar. Solo se monta cuando la clínica tiene esDemo = true.
export function DemoBanner({ expira }: { expira: string | null }) {
  const [oculto, setOculto] = useState(false)
  if (oculto) return null

  const dias = expira
    ? Math.max(0, Math.ceil((new Date(expira).getTime() - Date.now()) / 86400000))
    : null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] w-[calc(100%-2rem)] max-w-2xl">
      <div className="bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-700 px-4 py-3 flex items-center gap-3">
        <span className="hidden sm:flex w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Estás en una demo de Cláriva</p>
          <p className="text-xs text-slate-300">
            Los datos son de ejemplo{dias != null ? ` y se borran en ${dias} día${dias === 1 ? '' : 's'}` : ''}. ¿Te gustó cómo funciona?
          </p>
        </div>
        <a href="https://wa.me/56900000000?text=Hola,%20probé%20la%20demo%20de%20Cláriva%20y%20quiero%20contratar"
          target="_blank" rel="noopener noreferrer"
          className="flex-shrink-0 px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold rounded-xl transition-colors">
          Contratar
        </a>
        <button onClick={() => setOculto(true)} aria-label="Ocultar" className="flex-shrink-0 text-slate-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}
