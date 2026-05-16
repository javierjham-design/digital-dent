'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'

export default function CambiarPasswordPage() {
  const [current, setCurrent] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nueva !== confirma) { setError('Las contraseñas no coinciden'); return }
    if (nueva.length < 6) { setError('Mínimo 6 caracteres'); return }
    if (nueva === current) { setError('La nueva contraseña debe ser distinta a la actual'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: nueva }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      setOk(true)
      // Reloguear para refrescar JWT con passwordChangedAt actualizado.
      // Volvemos al login del contexto correcto si venimos de /c/<slug>/.
      const m = window.location.pathname.match(/^\/c\/([a-z0-9-]+)\b/i)
      const callbackUrl = m ? `/c/${m[1]}/login` : '/login'
      setTimeout(() => signOut({ callbackUrl }), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-cyan-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1 text-center">Cambia tu contraseña</h1>
          <p className="text-slate-500 text-sm mb-6 text-center">
            Por seguridad, debes elegir una contraseña personal antes de continuar.
          </p>

          {ok ? (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl text-sm">
              Contraseña actualizada. Te llevamos al login para que entres con la nueva...
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña actual</label>
                <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nueva contraseña</label>
                <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={6} autoComplete="new-password"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar nueva contraseña</label>
                <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required minLength={6} autoComplete="new-password"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
              </div>
              {error && <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white font-semibold py-3 rounded-xl">
                {loading ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
