import { useEffect, useState } from 'react'
import { automatizacionesService, type Automatizaciones as Auto } from '@/services/automatizaciones.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

// Gestor de IA: configurador completo de la automatización conversacional con pacientes por
// WhatsApp (TuBot). Maestro + flujos (confirmaciones de hora, recaptura de inasistencias,
// recaptura de tratamiento) + tiempos de detección. El envío/conversación los hace TuBot.
function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-cyan-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function GestorIA() {
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
        maestroActivo: a.maestroActivo,
        confirmacionesActivo: a.confirmaciones.activo,
        hora1: a.confirmaciones.hora1,
        segundaActiva: a.confirmaciones.segundaActiva,
        hora2: a.confirmaciones.hora2,
        plantillaRecordatorio: a.confirmaciones.plantilla,
        plantillaInsistencia: a.confirmaciones.plantillaInsistencia,
        plantillaNoShow: a.noShow.plantilla,
        plantillaTratamiento: a.tratamiento.plantilla,
        noShowActivo: a.noShow.activo,
        tratamientoActivo: a.tratamiento.activo,
        noShowHorasAuto: a.noShow.horasAuto,
        perdidoDias: a.noShow.diasPerdido,
        tratamientoDiasEspera: a.tratamiento.diasEspera,
      })
      setA(upd); setOk(true)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo guardar') } finally { setGuardando(false) }
  }

  if (!puedeConfig) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso al Gestor de IA. Pídele a un administrador el permiso <span className="font-medium">“Configurar la clínica”</span>.</p>
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!a) return <p className="text-rose-600 text-sm">{error || 'No se pudo cargar.'}</p>

  const num = (v: string) => (v === '' ? 0 : Number(v))
  const inp = 'w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-400'
  const off = !a.maestroActivo
  const sinPlantillas = a.plantillasDisponibles.length === 0

  const plantillaSelect = (label: string, value: string | null, onChange: (v: string | null) => void, disabled?: boolean) => (
    <label className="block mt-2">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <select disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-400">
        <option value="">— Elegir plantilla —</option>
        {a.plantillasDisponibles.map((p) => <option key={p.name} value={p.name}>{p.name}{p.variables != null ? ` · ${p.variables} var.` : ''}</option>)}
      </select>
    </label>
  )

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Gestor de IA</h1>
      <p className="text-sm text-slate-500 mb-4">Automatización conversacional con tus pacientes por WhatsApp. Acá enciendes y configuras todo; el envío de los mensajes y la conversación los realiza el asistente de agendamiento (TuBot).</p>

      {/* Conexión */}
      <div className={`mb-4 text-sm px-3 py-2 rounded-xl border ${a.tubotConectado ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {a.tubotConectado ? '✓ Conexión con TuBot lista.' : '⚠ TuBot aún no está conectado. Pídele al equipo de Cláriva que lo active para poder encender las automatizaciones.'}
      </div>
      {a.tubotConectado && sinPlantillas && (
        <div className="mb-4 text-sm px-3 py-2 rounded-xl border bg-sky-50 border-sky-200 text-sky-700">
          Aún no hay plantillas de WhatsApp sincronizadas. Se cargan solas cuando se aprueban en Meta y TuBot las sincroniza; recarga esta pantalla cuando estén listas para elegirlas por flujo.
        </div>
      )}

      {/* Maestro */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Automatización conversacional</h2>
            <p className="text-xs text-slate-500 mt-0.5">Interruptor maestro. Apagado = no se envía NADA al paciente (confirmaciones ni recaptura). Enciéndelo cuando todo esté listo.</p>
          </div>
          <Switch on={a.maestroActivo} disabled={!a.tubotConectado} onChange={(v) => set({ maestroActivo: v })} />
        </div>
        {off && <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Está apagado: no se envían mensajes. Puedes configurar los flujos abajo y encender cuando quieras.</p>}
      </section>

      {/* Confirmaciones */}
      <section className={`bg-white rounded-2xl border border-slate-200 p-4 mb-4 ${off ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Confirmaciones de hora</h2>
            <p className="text-xs text-slate-500 mt-0.5">Recordatorio por WhatsApp el día anterior a la cita. Al responder, el asistente confirma o reagenda.</p>
          </div>
          <Switch on={a.confirmaciones.activo} onChange={(v) => set({ confirmaciones: { ...a.confirmaciones, activo: v } })} />
        </div>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            1er recordatorio el día anterior a las
            <input type="time" disabled={off} value={a.confirmaciones.hora1} onChange={(e) => set({ confirmaciones: { ...a.confirmaciones, hora1: e.target.value } })}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-400" />
          </label>
          {plantillaSelect('Plantilla del 1er recordatorio', a.confirmaciones.plantilla, (v) => set({ confirmaciones: { ...a.confirmaciones, plantilla: v } }), off)}
          <div className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800">2ª reconfirmación si no responde</p>
                <p className="text-xs text-slate-500 mt-0.5">Un segundo mensaje —con un <span className="font-medium">texto distinto de insistencia</span> (p. ej. avisando que el cupo puede liberarse si no confirma)— solo a quien <span className="font-medium">no respondió</span> al primero.</p>
              </div>
              <Switch on={a.confirmaciones.segundaActiva} disabled={off} onChange={(v) => set({ confirmaciones: { ...a.confirmaciones, segundaActiva: v } })} />
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              Enviarla a las
              <input type="time" disabled={off || !a.confirmaciones.segundaActiva} value={a.confirmaciones.hora2} onChange={(e) => set({ confirmaciones: { ...a.confirmaciones, hora2: e.target.value } })}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-400" />
              del día anterior
            </label>
            {plantillaSelect('Plantilla de la insistencia (texto distinto)', a.confirmaciones.plantillaInsistencia, (v) => set({ confirmaciones: { ...a.confirmaciones, plantillaInsistencia: v } }), off || !a.confirmaciones.segundaActiva)}
          </div>
        </div>
      </section>

      {/* Recaptura de inasistencias */}
      <section className={`bg-white rounded-2xl border border-slate-200 p-4 mb-4 ${off ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Recaptura de inasistencias (no-show)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Si el paciente no asistió a su evaluación, al día siguiente se le escribe para reagendar (solo pacientes nuevos).</p>
          </div>
          <Switch on={a.noShow.activo} onChange={(v) => set({ noShow: { ...a.noShow, activo: v } })} />
        </div>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            Marcar “No asistió” automáticamente <input className={inp} disabled={off} inputMode="numeric" value={a.noShow.horasAuto} onChange={(e) => set({ noShow: { ...a.noShow, horasAuto: num(e.target.value) } })} /> h después de la hora de la cita
          </label>
          <label className="flex items-center gap-2">
            Pasar a “Perdido” tras <input className={inp} disabled={off} inputMode="numeric" value={a.noShow.diasPerdido} onChange={(e) => set({ noShow: { ...a.noShow, diasPerdido: num(e.target.value) } })} /> días sin reagendar
          </label>
        </div>
        {plantillaSelect('Plantilla del mensaje de recaptura', a.noShow.plantilla, (v) => set({ noShow: { ...a.noShow, plantilla: v } }), off)}
      </section>

      {/* Recaptura de tratamiento */}
      <section className={`bg-white rounded-2xl border border-slate-200 p-4 mb-4 ${off ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Recaptura de tratamiento no tomado</h2>
            <p className="text-xs text-slate-500 mt-0.5">Si el paciente asistió pero no inició su tratamiento (plan sin pago ni ejecución), se le escribe para motivarlo a retomarlo.</p>
          </div>
          <Switch on={a.tratamiento.activo} onChange={(v) => set({ tratamiento: { ...a.tratamiento, activo: v } })} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          Avisar tras <input className={inp} disabled={off} inputMode="numeric" value={a.tratamiento.diasEspera} onChange={(e) => set({ tratamiento: { ...a.tratamiento, diasEspera: num(e.target.value) } })} /> días desde la evaluación
        </label>
        {plantillaSelect('Plantilla del mensaje de recaptura', a.tratamiento.plantilla, (v) => set({ tratamiento: { ...a.tratamiento, plantilla: v } }), off)}
      </section>

      <p className="text-[11px] text-slate-400 mb-3">Los textos de los mensajes, la hora exacta de envío y el comportamiento del asistente se gestionan en TuBot. Acá controlas qué está encendido y los tiempos de detección.</p>

      {error && <p className="text-rose-600 text-sm mb-2">{error}</p>}
      {ok && <p className="text-emerald-600 text-sm mb-2">✓ Guardado.</p>}
      <button onClick={guardar} disabled={guardando} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  )
}
