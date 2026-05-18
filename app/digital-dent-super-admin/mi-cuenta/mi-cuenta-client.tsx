'use client'

import Link from 'next/link'
import { useState } from 'react'
import { signOut } from 'next-auth/react'

export function MiCuentaClient({ email, name }: { email: string; name: string }) {
  const [current, setCurrent] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nueva.length < 6) return setError('La nueva contraseña debe tener al menos 6 caracteres')
    if (nueva !== confirma) return setError('Las contraseñas no coinciden')
    if (nueva === current) return setError('La nueva contraseña debe ser distinta a la actual')

    setLoading(true)
    try {
      const res = await fetch('/api/auth/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: nueva }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        return
      }
      setOk(true)
      // Forzar relogin para refrescar JWT
      setTimeout(() => signOut({ callbackUrl: '/digital-dent-admin-login' }), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/digital-dent-super-admin" className="text-sm text-purple-300 hover:text-purple-200">
          ← Volver al panel
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-1">Mi cuenta</h1>
      <p className="text-slate-400 text-sm mb-8">Datos del super-administrador.</p>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Datos de la cuenta</h2>
        <div className="grid grid-cols-1 gap-3 text-sm">
          <Row label="Nombre" value={name || '—'} />
          <Row label="Email" value={email} />
          <Row label="Rol" value="Super-administrador" />
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Cambiar contraseña
        </h2>
        <p className="text-xs text-slate-500 mb-5">
          Tras guardar, se cerrará tu sesión y deberás iniciar nuevamente con la nueva contraseña.
        </p>

        {ok ? (
          <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 px-4 py-3 rounded-xl text-sm">
            Contraseña actualizada. Cerrando sesión...
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Contraseña actual">
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 6 caracteres">
              <input
                type="password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </Field>
            <Field label="Confirmar nueva contraseña">
              <input
                type="password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </Field>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {loading ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500 text-xs uppercase tracking-wider">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
