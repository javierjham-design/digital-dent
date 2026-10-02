import { useEffect, useState } from 'react'
import { automatizacionesService, type Automatizaciones as Auto } from '@/services/automatizaciones.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

// Centro de Automatizaciones: parámetros de detección que gobierna Cláriva (cierre de
// inasistencias, paso a Perdido y cuándo avisar de un tratamiento no tomado). El ENVÍO de
// WhatsApp (recordatorios y recaptura) y su conversación los maneja TuBot.
export function Automatizaciones() {
  const { user } = useAuth()
  const puedeConfig = user?.role === 'admin' || Boolean(user?.permisos?.puedeConfigurarClinica)
  const [a, setA] = useState<Auto | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    automatizacionesService.obtener().then(setA).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }, [])

  function set(patch: Partial<Auto>) { setA((p) => (p ? { ...p, ...patch } : p)); setOk(false) }

  async function guardar() {
    if (!a) return
    setGuardando(true); setError(''); setOk(false)
    try {
      const upd = await automatizacionesService.guardar({
        noShowHorasAuto: a.noShow.horasAuto,
        perdidoDias: a.noShow.diasPerdido,
        tratamientoDiasEspera: a.tratamiento.diasEspera,
      })
      setA(upd); setOk(true)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo guardar') } finally { setGuardando(false) }
  }

  if (!puedeConfig) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso a las automatizaciones. Pídele a un administrador el permiso <span className="font-medium">“Configurar la clínica”</span>.</p>
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!a) return <p className="text-rose-600 text-sm">{error || 'No se pudo cargar.'}</p>

  const num = (v: string) => (v === '' ? 0 : Number(v))
  const inp = 'w-28 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500'

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Automatizaciones</h1>
      <p className="text-sm text-slate-500 mb-4">Reglas de detección de la clínica. Los mensajes de WhatsApp (recordatorios y recaptura) y su conversación los gestiona el asistente de agendamiento en TuBot.</p>

      <div className={`mb-4 text-sm px-3 py-2 rounded-xl border ${a.tubotConectado ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {a.tubotConectado ? '✓ Conectado con TuBot: los avisos por WhatsApp salen automáticamente.' : '⚠ Aún no está conectada la integración con TuBot. Pídele al equipo de Cláriva que la active para que salgan los recordatorios y la recaptura.'}
      </div>

      {/* Inasistencias (no-show) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Inasistencias (no-show)</h2>
        <p className="text-xs text-slate-500 mb-3">Si una cita pasa su hora y nadie la marca, se cierra sola como <span className="font-medium">No asistió</span> (nunca se asume que asistió) y se avisa a TuBot para recapturar. Un no-show que no reagenda se marca Perdido.</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Marcar “No asistió” <input className={inp} inputMode="numeric" value={a.noShow.horasAuto} onChange={(e) => set({ noShow: { ...a.noShow, horasAuto: num(e.target.value) } })} /> horas después de la hora de la cita
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Pasar a “Perdido” tras <input className={inp} inputMode="numeric" value={a.noShow.diasPerdido} onChange={(e) => set({ noShow: { ...a.noShow, diasPerdido: num(e.target.value) } })} /> días sin reagendar
          </label>
        </div>
      </section>

      {/* Tratamiento no tomado */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Tratamiento no tomado</h2>
        <p className="text-xs text-slate-500 mb-3">Cuando un paciente asistió a su evaluación pero no inició el tratamiento (plan sin pago ni ejecución), se avisa a TuBot para motivarlo. Se espera unos días antes de insistir.</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Avisar tras <input className={inp} inputMode="numeric" value={a.tratamiento.diasEspera} onChange={(e) => set({ tratamiento: { ...a.tratamiento, diasEspera: num(e.target.value) } })} /> días desde la evaluación
        </label>
      </section>

      {error && <p className="text-rose-600 text-sm mb-2">{error}</p>}
      {ok && <p className="text-emerald-600 text-sm mb-2">✓ Guardado.</p>}
      <button onClick={guardar} disabled={guardando} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  )
}
