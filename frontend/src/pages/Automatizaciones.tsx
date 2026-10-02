import { useEffect, useState } from 'react'
import { automatizacionesService, type Automatizaciones as Auto } from '@/services/automatizaciones.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

// Centro de Automatizaciones: comportamiento de los recordatorios, el cierre automático de
// no-shows y la recaptura por WhatsApp. Las credenciales de TuBot las conecta Cláriva.
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
        recordatoriosHorasAntes: a.recordatorios.horasAntes,
        noShowHorasAuto: a.noShow.horasAuto,
        perdidoDias: a.noShow.diasPerdido,
        recapturaNoShowEnabled: a.recaptura.noShow.activo,
        waTemplateRecapturaNoShow: a.recaptura.noShow.plantilla,
        recapturaTratEnabled: a.recaptura.tratamiento.activo,
        waTemplateRecapturaTrat: a.recaptura.tratamiento.plantilla,
        recapturaTratDias: a.recaptura.tratamiento.dias,
      })
      setA(upd); setOk(true)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo guardar') } finally { setGuardando(false) }
  }

  if (!puedeConfig) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso a las automatizaciones. Pídele a un administrador el permiso <span className="font-medium">“Configurar la clínica”</span>.</p>
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!a) return <p className="text-rose-600 text-sm">{error || 'No se pudo cargar.'}</p>

  const num = (v: string) => (v === '' ? 0 : Number(v))
  const inp = 'w-28 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500'
  const tpl = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500'

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Automatizaciones</h1>
      <p className="text-sm text-slate-500 mb-4">Recordatorios, cierre de inasistencias y recaptura por WhatsApp. La conexión de WhatsApp (TuBot) la configura el equipo de Cláriva.</p>

      <div className={`mb-4 text-sm px-3 py-2 rounded-xl border ${a.whatsappConectado ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {a.whatsappConectado ? '✓ WhatsApp conectado para tu clínica.' : '⚠ WhatsApp aún no está conectado. Pídele al equipo de Cláriva que lo active para usar recordatorios y recaptura.'}
      </div>

      {/* Recordatorios de cita */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Recordatorios de cita</h2>
        <p className="text-xs text-slate-500 mb-3">Mensaje de WhatsApp con botones Confirmar / Cancelar / Reagendar antes de la hora. {a.recordatorios.activo ? '' : '(Se envían cuando WhatsApp esté conectado.)'}</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Enviar <input className={inp} inputMode="numeric" value={a.recordatorios.horasAntes} onChange={(e) => set({ recordatorios: { ...a.recordatorios, horasAntes: num(e.target.value) } })} /> horas antes de la cita
        </label>
      </section>

      {/* Inasistencias (no-show) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Inasistencias (no-show)</h2>
        <p className="text-xs text-slate-500 mb-3">Si una cita pasa su hora y nadie la marca, se cierra sola como <span className="font-medium">No asistió</span> (nunca se asume que asistió). Un no-show que no reagenda se marca Perdido.</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Marcar “No asistió” <input className={inp} inputMode="numeric" value={a.noShow.horasAuto} onChange={(e) => set({ noShow: { ...a.noShow, horasAuto: num(e.target.value) } })} /> horas después de la hora de la cita
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Pasar a “Perdido” tras <input className={inp} inputMode="numeric" value={a.noShow.diasPerdido} onChange={(e) => set({ noShow: { ...a.noShow, diasPerdido: num(e.target.value) } })} /> días sin reagendar
          </label>
        </div>
      </section>

      {/* Recaptura por WhatsApp */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Recaptura por WhatsApp</h2>
        <p className="text-xs text-slate-500 mb-3">Al día siguiente ~10:00, solo a pacientes nuevos. Cada flujo necesita su plantilla <span className="font-medium">aprobada</span> en Meta/TuBot.</p>

        <div className="rounded-xl border border-slate-100 p-3 mb-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" className="w-4 h-4 accent-cyan-600" checked={a.recaptura.noShow.activo} onChange={(e) => set({ recaptura: { ...a.recaptura, noShow: { ...a.recaptura.noShow, activo: e.target.checked } } })} />
            No asistió a la evaluación → motivar reagendar
          </label>
          <div className="mt-2">
            <span className="block text-xs text-slate-500 mb-1">Plantilla de WhatsApp</span>
            <input className={tpl} placeholder="recaptura_noshow" value={a.recaptura.noShow.plantilla ?? ''} onChange={(e) => set({ recaptura: { ...a.recaptura, noShow: { ...a.recaptura.noShow, plantilla: e.target.value } } })} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" className="w-4 h-4 accent-cyan-600" checked={a.recaptura.tratamiento.activo} onChange={(e) => set({ recaptura: { ...a.recaptura, tratamiento: { ...a.recaptura.tratamiento, activo: e.target.checked } } })} />
            Asistió pero no tomó el tratamiento → motivar iniciarlo
          </label>
          <div className="mt-2 grid sm:grid-cols-2 gap-3">
            <div>
              <span className="block text-xs text-slate-500 mb-1">Plantilla de WhatsApp</span>
              <input className={tpl} placeholder="recaptura_tratamiento" value={a.recaptura.tratamiento.plantilla ?? ''} onChange={(e) => set({ recaptura: { ...a.recaptura, tratamiento: { ...a.recaptura.tratamiento, plantilla: e.target.value } } })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 self-end pb-2">
              Esperar <input className={inp} inputMode="numeric" value={a.recaptura.tratamiento.dias} onChange={(e) => set({ recaptura: { ...a.recaptura, tratamiento: { ...a.recaptura.tratamiento, dias: num(e.target.value) } } })} /> días
            </label>
          </div>
        </div>
      </section>

      {error && <p className="text-rose-600 text-sm mb-2">{error}</p>}
      {ok && <p className="text-emerald-600 text-sm mb-2">✓ Guardado.</p>}
      <button onClick={guardar} disabled={guardando} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  )
}
