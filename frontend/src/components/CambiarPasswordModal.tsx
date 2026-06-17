import { useState } from 'react'
import { authService } from '@/services/auth.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

// `forzado` = el usuario debe cambiar la contraseña antes de seguir (primer
// ingreso o reset por el admin). En ese caso no se puede cerrar el modal.
export function CambiarPasswordModal({ forzado = false, onClose }: { forzado?: boolean; onClose: () => void }) {
  const { refrescar } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nueva !== repetir) { setError('Las contraseñas nuevas no coinciden.'); return }
    setGuardando(true)
    try {
      await authService.cambiarPassword(actual, nueva)
      await refrescar()
      setOk(true)
      if (!forzado) setTimeout(onClose, 1200)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !forzado && onClose()}>
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Cambiar contraseña</h2>
        {forzado && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">Debes definir una contraseña nueva antes de continuar.</p>}
        <p className="text-xs text-slate-400 mb-4">Mínimo 8 caracteres, con al menos una letra y un número.</p>

        <Campo label="Contraseña actual" value={actual} onChange={setActual} />
        <Campo label="Nueva contraseña" value={nueva} onChange={setNueva} />
        <Campo label="Repetir nueva contraseña" value={repetir} onChange={setRepetir} />

        {error && <p className="text-sm text-rose-600 mt-1 mb-2">{error}</p>}
        {ok && <p className="text-sm text-emerald-600 mt-1 mb-2">Contraseña actualizada.</p>}

        <div className="flex gap-2 mt-4">
          {!forzado && <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm">Cancelar</button>}
          <button type="submit" disabled={guardando || !actual || !nueva}
            className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm">
            {guardando ? 'Guardando…' : 'Cambiar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} required autoComplete="off"
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
