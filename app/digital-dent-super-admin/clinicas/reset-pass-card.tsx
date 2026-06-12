'use client'

import { useState } from 'react'

export function ResetAdminPasswordCard({ clinicaId }: { clinicaId: string }) {
  const [usarDefault, setUsarDefault] = useState(true)
  const [nuevaPass, setNuevaPass] = useState('')
  const [confirmaPass, setConfirmaPass] = useState('')
  const [forzarCambio, setForzarCambio] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{ password: string; forzar: boolean; creado: boolean } | null>(null)

  async function submit() {
    setError('')
    if (!usarDefault) {
      if (nuevaPass.length < 8) return setError('Mínimo 8 caracteres')
      if (nuevaPass !== confirmaPass) return setError('Las contraseñas no coinciden')
    }

    if (!confirm('¿Resetear (o crear) la contraseña del Administrador de esta clínica?')) return

    setLoading(true)
    try {
      const body: Record<string, unknown> = { forceChange: forzarCambio }
      if (!usarDefault) body.newPassword = nuevaPass
      const res = await fetch(`/api/admin/clinicas/${clinicaId}/reset-admin-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('application/json')) {
        setError(`Error ${res.status}: respuesta no válida del servidor`)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        return
      }
      setResultado({ password: data.nuevaPassword, forzar: data.forzarCambio, creado: Boolean(data.creado) })
      setNuevaPass('')
      setConfirmaPass('')
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function copiar() {
    if (resultado) navigator.clipboard.writeText(resultado.password)
  }

  if (resultado) {
    return (
      <section className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-semibold text-emerald-300">
            {resultado.creado ? 'Usuario Administrador creado' : 'Contraseña actualizada'}
          </h2>
        </div>
        <p className="text-sm text-slate-300 mb-3">
          {resultado.creado
            ? 'Se creó el usuario Administrador. Comparte esta contraseña con la clínica:'
            : 'Comparte esta contraseña con la clínica:'}
        </p>
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono break-all">
            {resultado.password}
          </code>
          <button onClick={copiar} className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-xs font-medium">
            Copiar
          </button>
        </div>
        {resultado.forzar && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
            ⚠️ La plataforma le pedirá cambiarla al iniciar sesión.
          </p>
        )}
        <button
          onClick={() => setResultado(null)}
          className="text-sm text-slate-400 hover:text-slate-200 underline"
        >
          Volver
        </button>
      </section>
    )
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Resetear contraseña del Administrador
      </h2>
      <p className="text-xs text-slate-500 mb-5">
        Útil cuando la clínica perdió acceso. La nueva clave reemplaza a la actual del usuario <code className="font-mono text-slate-300">Administrador</code>.
      </p>

      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUsarDefault(true)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              usarDefault ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
          >
            Generar aleatoria
          </button>
          <button
            type="button"
            onClick={() => setUsarDefault(false)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              !usarDefault ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
          >
            Clave personalizada
          </button>
        </div>

        {!usarDefault && (
          <>
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Nueva contraseña</label>
              <input
                type="text"
                value={nuevaPass}
                onChange={(e) => setNuevaPass(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Confirmar</label>
              <input
                type="text"
                value={confirmaPass}
                onChange={(e) => setConfirmaPass(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={forzarCambio}
            onChange={(e) => setForzarCambio(e.target.checked)}
            className="w-4 h-4 rounded text-purple-600"
          />
          Forzar al usuario a cambiarla al iniciar sesión
        </label>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 text-amber-200 border border-amber-500/40 rounded-lg text-sm font-semibold transition-colors"
        >
          {loading ? 'Reseteando...' : 'Resetear contraseña'}
        </button>
      </div>
    </section>
  )
}
