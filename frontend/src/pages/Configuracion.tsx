import { useEffect, useState } from 'react'
import type { ClinicaConfigDTO } from '@shared/types'
import { clinicaService } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'

export function Configuracion() {
  const [data, setData] = useState<ClinicaConfigDTO | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    clinicaService.obtener().then(setData).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }, [])

  function set<K extends keyof ClinicaConfigDTO>(k: K, v: ClinicaConfigDTO[K]) {
    setData((d) => (d ? { ...d, [k]: v } : d))
    setOk(false)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setGuardando(true); setError(''); setOk(false)
    try {
      const updated = await clinicaService.actualizar({
        nombre: data.nombre, direccion: data.direccion, telefono: data.telefono,
        email: data.email, ciudad: data.ciudad, mensajeWA: data.mensajeWA,
      })
      setData(updated)
      setOk(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!data) return <p className="text-rose-600 text-sm">{error || 'No se pudo cargar la configuración'}</p>

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Configuración de la clínica</h1>
      <form onSubmit={guardar} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <Field label="Nombre" value={data.nombre} onChange={(v) => set('nombre', v)} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Teléfono" value={data.telefono} onChange={(v) => set('telefono', v)} />
          <Field label="Email" value={data.email} onChange={(v) => set('email', v)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Dirección" value={data.direccion} onChange={(v) => set('direccion', v)} />
          <Field label="Ciudad" value={data.ciudad} onChange={(v) => set('ciudad', v)} />
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Plantilla de mensaje WhatsApp</span>
          <textarea value={data.mensajeWA} onChange={(e) => set('mensajeWA', e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <p className="text-xs text-slate-400 mt-1">Variables: {'{nombre}'}, {'{clinica}'}, {'{fecha}'}, {'{direccion}'}</p>
        </label>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {ok && <p className="text-sm text-emerald-600">Cambios guardados.</p>}
        <button type="submit" disabled={guardando}
          className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
