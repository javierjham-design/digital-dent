'use client'

import { useEffect } from 'react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard] Unhandled error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
      <div className="max-w-2xl w-full">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-red-700 mb-2">Error inesperado</h1>
          <p className="text-red-600 text-sm mb-4">El servidor devolvió un error al cargar esta página:</p>
          <pre className="bg-white border border-red-100 rounded-lg p-4 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
{error.message}
{error.stack ? '\n\n' + error.stack : ''}
          </pre>
          {error.digest && (
            <p className="text-xs text-red-500 mt-3">Digest: <span className="font-mono">{error.digest}</span></p>
          )}
          <div className="flex gap-3 mt-6">
            <button onClick={() => reset()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">
              Reintentar
            </button>
            <a href="/agenda" className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium">
              Ir a Agenda
            </a>
            <a href="/api/auth/signout?callbackUrl=/login" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">
              Cerrar sesión
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
