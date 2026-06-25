import { useEffect, useState } from 'react'
import type { ClinicaConfigDTO } from '@shared/types'
import { clinicaService, mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
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

      <MediosPago />
    </div>
  )
}

// Medios de pago (con % de comisión que alimenta el cálculo de liquidaciones).
function MediosPago() {
  const [medios, setMedios] = useState<MedioPagoDTO[]>([])
  const [nombre, setNombre] = useState('')
  const [comision, setComision] = useState('0')
  const [msg, setMsg] = useState('')
  const cargar = () => mediosPagoService.listar().then(setMedios).catch(() => {})
  useEffect(() => { cargar() }, [])
  async function crear() {
    if (!nombre.trim()) return
    try { await mediosPagoService.crear({ nombre: nombre.trim(), comision: Number(comision) || 0 }); setNombre(''); setComision('0'); setMsg(''); cargar() }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') }
  }
  const setComisionMedio = (m: MedioPagoDTO, v: string) => { mediosPagoService.actualizar(m.id, { comision: Number(v) || 0 }).then(cargar).catch(() => {}) }
  const toggle = (m: MedioPagoDTO) => { mediosPagoService.actualizar(m.id, { activo: !m.activo }).then(cargar).catch(() => {}) }
  const eliminar = (m: MedioPagoDTO) => { if (window.confirm(`¿Eliminar el medio de pago "${m.nombre}"?`)) mediosPagoService.eliminar(m.id).then(cargar).catch(() => {}) }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-5">
      <h2 className="text-lg font-bold text-slate-900">Medios de pago</h2>
      <p className="text-slate-500 text-sm mt-1 mb-4">El % de comisión se descuenta del monto liquidado a los profesionales.</p>
      <div className="divide-y divide-slate-100 mb-4">
        {medios.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className={`text-sm font-medium ${m.activo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{m.nombre}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-sm text-slate-500">
                Comisión
                <input type="number" defaultValue={m.comision} step="0.01" onBlur={(e) => setComisionMedio(m, e.target.value)}
                  className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right" /> %
              </label>
              <button onClick={() => toggle(m)} className="text-xs text-slate-500 hover:text-slate-800">{m.activo ? 'Desactivar' : 'Activar'}</button>
              <button onClick={() => eliminar(m)} className="text-xs text-slate-300 hover:text-rose-600">Eliminar</button>
            </div>
          </div>
        ))}
        {medios.length === 0 && <p className="text-sm text-slate-400 py-2">Sin medios de pago.</p>}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Nuevo medio</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Transbank débito"
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Comisión %</span>
          <input type="number" value={comision} step="0.01" onChange={(e) => setComision(e.target.value)}
            className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </label>
        <button onClick={crear} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Agregar</button>
        {msg && <span className="text-sm text-rose-600">{msg}</span>}
      </div>
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
