'use client'

import { useEffect } from 'react'

export default function SuperAdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Esto aparece en Runtime Logs de Vercel.
    console.error('[super-admin] Unhandled error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex items-center justify-center">
      <div className="max-w-2xl w-full">
        <div className="bg-red-950 border border-red-800 rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-red-300 mb-2">Error en el panel super-admin</h1>
          <p className="text-red-200 text-sm mb-4">Detalle del error capturado:</p>
          <pre className="bg-black/40 rounded-lg p-4 text-xs text-red-300 overflow-x-auto whitespace-pre-wrap">
{error.message}
{error.stack ? '\n\n' + error.stack : ''}
          </pre>
          {error.digest && (
            <p className="text-xs text-red-400 mt-3">Digest: <span className="font-mono">{error.digest}</span></p>
          )}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => reset()}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm font-medium text-red-300"
            >
              Reintentar
            </button>
            <a
              href="/login"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-300"
            >
              Volver al login
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
