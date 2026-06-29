import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg } from '@fullcalendar/core'

// Tipo estructural común a eventDrop y eventResize (ambos traen event + revert).
type MoveArg = { event: { start: Date | null; end: Date | null; extendedProps: Record<string, unknown> }; revert: () => void }
import type { BloqueoDTO, CitaDTO, DoctorDTO, HorarioDTO, ClinicaConfigDTO } from '@shared/types'
import { CITA_ESTADOS, ESTADOS_NO_OCUPAN, siguienteEstado } from '@shared/constants/cita-estados'
import { bloqueosService, citasService, horariosLectura } from '@/services/clinica.service'
import { pacientesService } from '@/services/clinica.service'
import { clinicaService } from '@/services/catalogo.service'
import { usuariosService } from '@/services/equipo.service'
import { ApiError } from '@/services/api'
import { PacienteBuscador } from '@/components/PacienteBuscador'
import { RutField } from '@/components/RutField'
import { validarRut } from '@shared/utils/rut'

// Link de WhatsApp con el mensaje de confirmación prellenado desde Configuración.
// Variables disponibles: {nombre} (primer nombre), {nombrecompleto}, {profesional},
// {clinica}, {fecha} (día + hora), {dia}, {hora}, {direccion}, {telefono}, {motivo}.
function waLink(c: CitaDTO, clinica: ClinicaConfigDTO | null): string | null {
  if (!c.pacienteTelefono) return null
  const base = `https://wa.me/${c.pacienteTelefono.replace(/\D/g, '')}`
  const plantilla = clinica?.mensajeWA?.trim()
  if (!plantilla) return base
  const d = new Date(c.inicio)
  const fecha = d.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
  const dia = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const horaTxt = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
  const primerNombre = c.pacienteNombre.split(' ')[0] ?? c.pacienteNombre
  const msg = plantilla
    .replace(/\{nombrecompleto\}/gi, c.pacienteNombre)
    .replace(/\{nombre\}/gi, primerNombre)
    .replace(/\{profesional\}/gi, c.doctor ?? '')
    .replace(/\{clinica\}/gi, clinica?.nombre ?? '')
    .replace(/\{fecha\}/gi, fecha)
    .replace(/\{dia\}/gi, dia)
    .replace(/\{hora\}/gi, horaTxt)
    .replace(/\{direccion\}/gi, clinica?.direccion ?? '')
    .replace(/\{telefono\}/gi, clinica?.telefono ?? '')
    .replace(/\{motivo\}/gi, c.tipo ?? '')
  return `${base}?text=${encodeURIComponent(msg)}`
}

const MOTIVOS = ['Consulta diagnóstico', 'Control', 'Detartraje / Profilaxis', 'Obturación', 'Endodoncia', 'Exodoncia', 'Ortodoncia', 'Blanqueamiento', 'Urgencia', 'Otro']
const DURACIONES = [15, 30, 45, 60, 90, 120]

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })

type Vista = 'semanal' | 'diaria'

export function Agenda() {
  const calRef = useRef<FullCalendar>(null)
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [citas, setCitas] = useState<CitaDTO[]>([])
  const [bloqueos, setBloqueos] = useState<BloqueoDTO[]>([])
  const [horarios, setHorarios] = useState<HorarioDTO[]>([])
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)

  const [vista, setVista] = useState<Vista>('diaria')
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [doctorId, setDoctorId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(Object.keys(CITA_ESTADOS)))

  const [selected, setSelected] = useState<CitaDTO | null>(null)
  const [selectedBloqueo, setSelectedBloqueo] = useState<BloqueoDTO | null>(null)
  const [crear, setCrear] = useState<null | { slotISO: string }>(null)
  const [bloqueoForm, setBloqueoForm] = useState(false)
  const [slotAccion, setSlotAccion] = useState<null | { slotISO: string }>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)

  function notify(t: string, ok = true) { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  // Carga inicial: doctores (los pacientes se buscan en el servidor al crear cita).
  useEffect(() => {
    // Por defecto se muestran TODOS los profesionales (doctorId vacío); la vista
    // inicial es la diaria (lista), donde "Todos" es una opción válida.
    usuariosService.doctores().then(setDoctores).catch(() => {})
    clinicaService.obtener().then(setClinica).catch(() => {})
  }, [])

  // Rango visible según vista.
  const rango = useMemo(() => {
    const start = new Date(currentDate)
    const end = new Date(currentDate)
    if (vista === 'semanal') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // lunes
      end.setTime(start.getTime()); end.setDate(end.getDate() + 6)
    }
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }, [currentDate, vista])

  const recargar = useCallback(() => {
    citasService.listar(rango.from, rango.to).then(setCitas).catch(() => {})
    bloqueosService.listar(rango.from, rango.to, doctorId || undefined).then(setBloqueos).catch(() => {})
    if (doctorId) horariosLectura.listar(doctorId).then(setHorarios).catch(() => {})
  }, [rango.from, rango.to, doctorId])

  useEffect(() => { recargar() }, [recargar])

  // Sincronizar FullCalendar (vista semanal en bloques) con la fecha actual.
  useEffect(() => {
    const api = calRef.current?.getApi()
    if (api && vista === 'semanal') api.gotoDate(currentDate)
  }, [currentDate, vista])

  const businessHours = useMemo(() => {
    const activos = horarios.filter((h) => h.activo)
    if (activos.length === 0) return false
    // Si el día tiene receso activo, partimos las horas hábiles en dos bloques
    // (antes y después del receso) para que el tramo de receso quede como "fuera
    // de horario" (gris) y no aparezca disponible para atender.
    const blocks: { daysOfWeek: number[]; startTime: string; endTime: string }[] = []
    for (const h of activos) {
      if (h.recesoActivo && h.recesoInicio && h.recesoFin && h.recesoInicio < h.recesoFin) {
        blocks.push({ daysOfWeek: [h.diaSemana], startTime: h.horaInicio, endTime: h.recesoInicio })
        blocks.push({ daysOfWeek: [h.diaSemana], startTime: h.recesoFin, endTime: h.horaFin })
      } else {
        blocks.push({ daysOfWeek: [h.diaSemana], startTime: h.horaInicio, endTime: h.horaFin })
      }
    }
    return blocks
  }, [horarios])

  const citasVisibles = useMemo(
    () => citas.filter((c) => (doctorId ? c.doctorId === doctorId : true) && statusFilter.has(c.estado)),
    [citas, doctorId, statusFilter],
  )

  const events = useMemo(() => {
    const ev = citasVisibles.map((c) => {
      const cfg = CITA_ESTADOS[c.estado]
      return {
        id: `cita-${c.id}`, title: c.pacienteNombre, start: c.inicio, end: c.fin,
        backgroundColor: cfg?.color ?? '#0891b2', borderColor: cfg?.color ?? '#0891b2', textColor: '#fff',
        extendedProps: { kind: 'cita' as const, cita: c },
      }
    })
    const blq = bloqueos.filter((b) => !doctorId || b.doctorId === doctorId).map((b) => ({
      id: `blq-${b.id}`, title: `Bloqueo: ${b.motivo ?? ''}`, start: b.inicio, end: b.fin,
      backgroundColor: '#475569', borderColor: '#334155', textColor: '#f1f5f9', editable: false,
      extendedProps: { kind: 'bloqueo' as const, bloqueo: b },
    }))
    return [...ev, ...blq]
  }, [citasVisibles, bloqueos, doctorId])

  function shiftDate(dir: -1 | 1) {
    setCurrentDate((prev) => { const d = new Date(prev); d.setDate(d.getDate() + dir * (vista === 'semanal' ? 7 : 1)); return d })
  }

  const onEventClick = useCallback((arg: EventClickArg) => {
    const props = arg.event.extendedProps as { kind: 'cita' | 'bloqueo'; cita?: CitaDTO; bloqueo?: BloqueoDTO }
    if (props.kind === 'bloqueo' && props.bloqueo) setSelectedBloqueo(props.bloqueo)
    else if (props.cita) setSelected(props.cita)
  }, [])

  const onDrop = useCallback(async (arg: MoveArg) => {
    const props = arg.event.extendedProps as { kind: string; cita?: CitaDTO }
    if (props.kind !== 'cita' || !props.cita || !arg.event.start) { arg.revert(); return }
    const start = arg.event.start
    const end = arg.event.end
    const duracion = end ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) : undefined
    try {
      await citasService.editar(props.cita.id, { fecha: start.toISOString(), ...(duracion ? { duracion } : {}) })
      notify('Cita reagendada')
      recargar()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'No se pudo mover', false)
      arg.revert()
    }
  }, [recargar])

  async function cambiarEstado(id: string, estado: string) {
    try { await citasService.cambiarEstado(id, estado); notify('Estado actualizado'); setSelected(null); recargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  async function eliminarCita(id: string) {
    if (!confirm('¿Eliminar esta cita?')) return
    try { await citasService.eliminar(id); notify('Cita eliminada'); setSelected(null); recargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  async function eliminarBloqueo(id: string) {
    if (!confirm('¿Eliminar este bloqueo?')) return
    try { await bloqueosService.eliminar(id); notify('Bloqueo eliminado'); setSelectedBloqueo(null); recargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  const citasDelDia = useMemo(() => {
    const d0 = new Date(currentDate); d0.setHours(0, 0, 0, 0)
    const d1 = new Date(currentDate); d1.setHours(23, 59, 59, 999)
    return citasVisibles.filter((c) => { const t = new Date(c.inicio); return t >= d0 && t <= d1 })
      .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))
  }, [citasVisibles, currentDate])

  const labelFecha = vista === 'semanal'
    ? `Semana del ${new Date(rango.from).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}`
    : currentDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex gap-5">
      {/* Sidebar filtros */}
      <aside className="w-52 flex-shrink-0 hidden lg:block">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Profesional</p>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-cyan-500">
            {vista !== 'semanal' && <option value="">Todos</option>}
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
          </select>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Estados</p>
            <button onClick={() => setStatusFilter((p) => p.size === Object.keys(CITA_ESTADOS).length ? new Set() : new Set(Object.keys(CITA_ESTADOS)))}
              className="text-[11px] text-cyan-600 hover:underline">Todos</button>
          </div>
          <div className="space-y-1.5">
            {Object.entries(CITA_ESTADOS).map(([k, cfg]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={statusFilter.has(k)}
                  onChange={() => setStatusFilter((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />
                <span className="text-slate-600">{cfg.label}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      {/* Calendario */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDate(-1)} className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50">‹</button>
            <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setCurrentDate(d) }} className="text-xs font-semibold border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">Hoy</button>
            <button onClick={() => shiftDate(1)} className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50">›</button>
            <span className="text-sm font-semibold text-slate-800 capitalize ml-1">{labelFecha}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['diaria', 'semanal'] as Vista[]).map((v) => (
                <button key={v} onClick={() => { setVista(v); if (v === 'semanal' && !doctorId) setDoctorId(doctores[0]?.id ?? '') }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md ${vista === v ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500'}`}>
                  {v === 'diaria' ? 'Diaria' : 'Semanal'}
                </button>
              ))}
            </div>
            <button onClick={() => setBloqueoForm(true)} className="text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">Bloquear</button>
            <button onClick={() => setCrear({ slotISO: new Date(currentDate.getTime() + 9 * 3600000).toISOString() })}
              className="text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg px-3.5 py-1.5">+ Nueva cita</button>
          </div>
        </div>

        {/* Controles para móvil (en pantallas chicas el sidebar está oculto). */}
        <div className="lg:hidden mb-3 space-y-2">
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500">
            {vista !== 'semanal' && <option value="">Todos los profesionales</option>}
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
          </select>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {Object.entries(CITA_ESTADOS).map(([k, cfg]) => {
              const on = statusFilter.has(k)
              return (
                <button key={k} onClick={() => setStatusFilter((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${on ? 'border-transparent font-semibold' : 'border-slate-200 text-slate-400'}`}
                  style={on ? { background: cfg.bg, color: cfg.text } : undefined}>
                  <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {aviso && (
          <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>
        )}

        {vista === 'semanal' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-2 overflow-x-auto">
            {/* Estilo tipo Dentalink: espacios disponibles en verde, fuera de horario en gris,
                bloques anchos con el nombre del paciente. En móvil el grid scrollea horizontal. */}
            <style>{`
              .fc { min-width: 720px; --fc-border-color: #94a3b8; }
              .fc .fc-timegrid-slot { height: 1.95em; }
              .fc .fc-timegrid-slot-lane { background: #dcfce7; }
              .fc .fc-non-business { background: #eceef1 !important; }
              .fc .fc-day-today { background: transparent !important; }
              /* Separación entre días: barra gris sólida (pseudo-elemento posicionado) en el borde
                 de cada columna, con z-index alto para que SIEMPRE se vea sobre el verde y corte las
                 líneas horizontales. pointer-events:none para no bloquear el clic. */
              .fc .fc-timegrid-col { position: relative; }
              .fc td.fc-timegrid-col::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 2px; background: #9aa6b2; pointer-events: none; z-index: 4; }
              .fc td.fc-timegrid-axis::after { display: none; }
              /* Divisor horizontal entre cada bloque */
              .fc .fc-timegrid-slot { border-bottom: 1px solid #8fc2a4 !important; }
              .fc .fc-timegrid-slot-minor { border-top: 1px dotted #b9dcc8 !important; }
              .fc .fc-col-header-cell { padding: 6px 0; background: #f1f5f9; }
              .fc .fc-col-header-cell-cushion { font-weight: 600; color: #334155; text-transform: capitalize; }
              .fc .fc-day-today .fc-col-header-cell-cushion { color: #0891b2; }
              .fc .fc-timegrid-now-indicator-line { border-color: #ef4444; }
              .fc .fc-timegrid-event { border-radius: 5px; box-shadow: none; border: none; }
              .fc .fc-timegrid-event .fc-event-main { padding: 2px 5px; }
              .fc .fc-event-title { white-space: normal; font-weight: 600; font-size: 0.78rem; line-height: 1.12; }
            `}</style>
            <FullCalendar
              ref={calRef}
              plugins={[timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              initialDate={currentDate}
              locale={esLocale}
              headerToolbar={false}
              events={events}
              eventClick={onEventClick}
              editable
              eventDrop={onDrop}
              eventResize={onDrop}
              dateClick={(a) => setSlotAccion({ slotISO: a.date.toISOString() })}
              businessHours={businessHours}
              slotMinTime="07:00:00" slotMaxTime="21:00:00" slotDuration="00:15:00" slotLabelInterval="00:15:00"
              allDaySlot={false} height="auto" nowIndicator expandRows
              displayEventTime={false} eventMinHeight={32}
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            />
          </div>
        ) : (
          <DiariaLista citas={citasDelDia} clinica={clinica} onClick={setSelected} onAvanzar={(c) => { const n = siguienteEstado(c.estado); if (n) cambiarEstado(c.id, n.estado) }} />
        )}
      </div>

      {crear && (
        <CrearCitaModal slotISO={crear.slotISO} doctorId={doctorId || doctores[0]?.id || ''} doctores={doctores}
          onClose={() => setCrear(null)}
          onCreated={() => { setCrear(null); notify('Cita agendada'); recargar() }}
          onError={(m) => notify(m, false)} />
      )}
      {selected && (
        <CitaDetalle cita={selected} clinica={clinica} onClose={() => setSelected(null)} onEstado={cambiarEstado} onEliminar={eliminarCita} />
      )}
      {selectedBloqueo && (
        <BloqueoDetalle b={selectedBloqueo} onClose={() => setSelectedBloqueo(null)} onEliminar={eliminarBloqueo} />
      )}
      {bloqueoForm && (
        <BloqueoModal doctorId={doctorId || doctores[0]?.id || ''} doctores={doctores} fecha={currentDate}
          onClose={() => setBloqueoForm(false)} onCreated={() => { setBloqueoForm(false); notify('Horario bloqueado'); recargar() }}
          onError={(m) => notify(m, false)} />
      )}
      {slotAccion && (
        <SlotAccionModal slotISO={slotAccion.slotISO} doctorId={doctorId || doctores[0]?.id || ''} doctores={doctores}
          citas={citas} bloqueos={bloqueos}
          onClose={() => setSlotAccion(null)}
          onCita={() => { setCrear({ slotISO: slotAccion.slotISO }); setSlotAccion(null) }}
          onBloqueado={() => { setSlotAccion(null); notify('Horario bloqueado'); recargar() }}
          onError={(m) => notify(m, false)} />
      )}
    </div>
  )
}

// ── Modal: ¿qué hacer en este slot? Agendar cita o bloquear (con duración tope) ──
function SlotAccionModal({ slotISO, doctorId, doctores, citas, bloqueos, onClose, onCita, onBloqueado, onError }: {
  slotISO: string; doctorId: string; doctores: DoctorDTO[]; citas: CitaDTO[]; bloqueos: BloqueoDTO[]
  onClose: () => void; onCita: () => void; onBloqueado: () => void; onError: (m: string) => void
}) {
  const start = useMemo(() => new Date(slotISO), [slotISO])
  const [doc, setDoc] = useState(doctorId)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Tope: hasta el próximo evento ocupado del profesional ese día, o el fin de agenda (21:00).
  const maxMin = useMemo(() => {
    const fin = new Date(start); fin.setHours(21, 0, 0, 0)
    let limite = fin.getTime()
    const ocupados = [
      ...citas.filter((c) => c.doctorId === doc && !ESTADOS_NO_OCUPAN.includes(c.estado)),
      ...bloqueos.filter((b) => b.doctorId === doc),
    ]
    for (const o of ocupados) { const s = new Date(o.inicio).getTime(); if (s > start.getTime() && s < limite) limite = s }
    return Math.max(15, Math.round((limite - start.getTime()) / 60000))
  }, [doc, citas, bloqueos, start])

  const opciones = [15, 30, 45, 60, 90, 120, 180, 240].filter((d) => d < maxMin)
  opciones.push(maxMin) // siempre incluir "todo el espacio disponible"
  const [dur, setDur] = useState(Math.min(30, maxMin))

  async function bloquear() {
    setGuardando(true)
    try {
      const fin = new Date(start.getTime() + dur * 60000)
      await bloqueosService.crear({ doctorId: doc, inicio: start.toISOString(), fin: fin.toISOString(), motivo: motivo || undefined })
      onBloqueado()
    } catch (e) { onError(e instanceof ApiError ? e.message : 'No se pudo bloquear') } finally { setGuardando(false) }
  }

  return (
    <Modal title={start.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })} onClose={onClose}>
      <button onClick={onCita} className="w-full mb-4 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Agendar cita</button>
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Bloquear este horario</p>
        <Sel label="Profesional" value={doc} onChange={setDoc} options={doctores.map((d) => ({ v: d.id, l: d.name ?? d.email ?? '' }))} />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Duración</span>
          <select value={dur} onChange={(e) => setDur(Number(e.target.value))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
            {opciones.map((d) => <option key={d} value={d}>{d >= maxMin ? `${d} min (todo el espacio disponible)` : `${d} min`}</option>)}
          </select>
        </label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={bloquear} disabled={guardando} className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Bloqueando…' : `Bloquear ${dur} min`}</button>
      </div>
    </Modal>
  )
}

// ── Vista diaria (lista) — pensada para gestionar confirmaciones rápido ──
function DiariaLista({ citas, clinica, onClick, onAvanzar }: { citas: CitaDTO[]; clinica: ClinicaConfigDTO | null; onClick: (c: CitaDTO) => void; onAvanzar: (c: CitaDTO) => void }) {
  if (citas.length === 0) return <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">Sin citas para este día.</div>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {citas.map((c) => {
        const cfg = CITA_ESTADOS[c.estado]
        const next = siguienteEstado(c.estado)
        const wa = waLink(c, clinica)
        return (
          <div key={c.id} className="flex items-center gap-3 px-3 sm:px-4 py-3">
            <div className="flex flex-col items-center rounded-lg px-2 py-1 shrink-0" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>
              <span className="font-mono text-[13px] font-bold">{hora(c.inicio)}</span>
              <span className="font-mono text-[11px] opacity-70">{hora(c.fin)}</span>
            </div>
            <button onClick={() => onClick(c)} className="flex-1 min-w-0 text-left">
              <p className="font-semibold text-cyan-800 hover:text-cyan-600 truncate">{c.pacienteNombre}</p>
              <p className="text-xs text-slate-500 truncate">{c.doctor} · {c.tipo}</p>
            </button>
            <span className="hidden sm:inline text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>{cfg?.label ?? c.estado}</span>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title="Confirmar por WhatsApp"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-base">✆</a>}
            {next && <button onClick={() => onAvanzar(c)} className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">{next.accion}</button>}
          </div>
        )
      })}
    </div>
  )
}

// ── Modal: crear cita ──
function CrearCitaModal({ slotISO, doctorId, doctores, onClose, onCreated, onError }: {
  slotISO: string; doctorId: string; doctores: DoctorDTO[]
  onClose: () => void; onCreated: () => void; onError: (m: string) => void
}) {
  const [doc, setDoc] = useState(doctorId)
  const [tipo, setTipo] = useState('')
  const [duracion, setDuracion] = useState(30)
  const [sobrecupo, setSobrecupo] = useState(false)
  const [modo, setModo] = useState<'existente' | 'nuevo'>('existente')
  const [pacienteId, setPacienteId] = useState('')
  const [nuevo, setNuevo] = useState({ nombre: '', apellido: '', rut: '', otroDoc: '', telefono: '' })
  const [guardando, setGuardando] = useState(false)

  const rutInvalido = Boolean(nuevo.rut) && !validarRut(nuevo.rut)
  const puede = modo === 'existente' ? !!pacienteId : (!!nuevo.nombre && !!nuevo.apellido && !rutInvalido)

  async function guardar() {
    setGuardando(true)
    try {
      let pid = pacienteId
      if (modo === 'nuevo') {
        const p = await pacientesService.crear({ nombre: nuevo.nombre, apellido: nuevo.apellido, rut: nuevo.rut || undefined, otroDocId: nuevo.otroDoc || undefined, telefono: nuevo.telefono || undefined })
        pid = p.id
      }
      await citasService.crear({ pacienteId: pid, doctorId: doc, fecha: slotISO, duracion, tipo: tipo || 'CONSULTA', sobrecupo })
      onCreated()
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'No se pudo agendar')
    } finally { setGuardando(false) }
  }

  return (
    <Modal title="Nueva cita" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">{new Date(slotISO).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
      <div className="space-y-3">
        <Sel label="Profesional" value={doc} onChange={setDoc} options={doctores.map((d) => ({ v: d.id, l: d.name ?? d.email ?? '' }))} />
        <Sel label="Motivo" value={tipo} onChange={setTipo} options={[{ v: '', l: 'Consulta' }, ...MOTIVOS.map((m) => ({ v: m, l: m }))]} />
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">Duración</span>
          <div className="flex gap-2 flex-wrap">
            {DURACIONES.map((d) => (
              <button key={d} type="button" onClick={() => setDuracion(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 ${duracion === d ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600'}`}>{d}m</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={sobrecupo} onChange={(e) => setSobrecupo(e.target.checked)} /> Sobrecupo (permite solaparse)
        </label>

        <div className="flex gap-2 pt-1">
          {(['existente', 'nuevo'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border-2 ${modo === m ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'}`}>
              {m === 'existente' ? 'Paciente existente' : 'Paciente nuevo'}
            </button>
          ))}
        </div>

        {modo === 'existente' ? (
          <PacienteBuscador onSelect={(p) => setPacienteId(p?.id ?? '')} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre *" className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <input value={nuevo.apellido} onChange={(e) => setNuevo({ ...nuevo, apellido: e.target.value })} placeholder="Apellido *" className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <div className="col-span-2"><RutField rut={nuevo.rut} otroDoc={nuevo.otroDoc} onChange={(v) => setNuevo({ ...nuevo, ...v })} /></div>
            <input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="Teléfono" className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-5">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={guardar} disabled={!puede || guardando} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Agendando…' : 'Agendar'}</button>
      </div>
    </Modal>
  )
}

// ── Modal: detalle de cita ──
function CitaDetalle({ cita, clinica, onClose, onEstado, onEliminar }: {
  cita: CitaDTO; clinica: ClinicaConfigDTO | null; onClose: () => void; onEstado: (id: string, estado: string) => void; onEliminar: (id: string) => void
}) {
  const next = siguienteEstado(cita.estado)
  const waUrl = waLink(cita, clinica)
  return (
    <Modal title={cita.pacienteNombre} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">{new Date(cita.inicio).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} · {hora(cita.inicio)}–{hora(cita.fin)}</p>
      <dl className="space-y-2 text-sm mb-4">
        <Row k="RUT" v={cita.pacienteRut ?? '—'} />
        <Row k="Teléfono" v={cita.pacienteTelefono ?? '—'} />
        <Row k="Profesional" v={cita.doctor ?? '—'} />
        <Row k="Motivo" v={cita.tipo} />
        <Row k="Estado" v={CITA_ESTADOS[cita.estado]?.label ?? cita.estado} />
      </dl>
      <Link to={`/pacientes/${cita.pacienteId}?tab=planes`} className="block w-full text-center mb-3 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Ir a planes de tratamiento</Link>
      {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center mb-3 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium">Escribir por WhatsApp</a>}
      {next && (
        <button onClick={() => onEstado(cita.id, next.estado)} className="w-full mb-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: CITA_ESTADOS[next.estado]?.color }}>
          {next.accion} → {CITA_ESTADOS[next.estado]?.label}
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(CITA_ESTADOS).map(([k, cfg]) => (
          <button key={k} onClick={() => onEstado(cita.id, k)} disabled={k === cita.estado}
            className="px-2 py-1.5 rounded-lg text-xs font-medium border-2 disabled:opacity-50"
            style={{ borderColor: cfg.color, color: cfg.text, backgroundColor: k === cita.estado ? cfg.bg : 'white' }}>{cfg.label}</button>
        ))}
      </div>
      <button onClick={() => onEliminar(cita.id)} className="w-full mt-4 text-xs text-rose-500 hover:text-rose-700">Eliminar cita</button>
    </Modal>
  )
}

function BloqueoDetalle({ b, onClose, onEliminar }: { b: BloqueoDTO; onClose: () => void; onEliminar: (id: string) => void }) {
  return (
    <Modal title="Bloqueo de agenda" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-2">{b.doctor}</p>
      <p className="text-sm text-slate-700">{new Date(b.inicio).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })} → {new Date(b.fin).toLocaleString('es-CL', { timeStyle: 'short' })}</p>
      {b.motivo && <p className="text-sm text-slate-600 mt-2">Motivo: {b.motivo}</p>}
      <button onClick={() => onEliminar(b.id)} className="w-full mt-5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium">Eliminar bloqueo</button>
    </Modal>
  )
}

function BloqueoModal({ doctorId, doctores, fecha, onClose, onCreated, onError }: {
  doctorId: string; doctores: DoctorDTO[]; fecha: Date; onClose: () => void; onCreated: () => void; onError: (m: string) => void
}) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
  const [doc, setDoc] = useState(doctorId)
  const [inicio, setInicio] = useState(`${base}T09:00`)
  const [fin, setFin] = useState(`${base}T11:00`)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    setGuardando(true)
    try {
      await bloqueosService.crear({ doctorId: doc, inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString(), motivo: motivo || undefined })
      onCreated()
    } catch (e) { onError(e instanceof ApiError ? e.message : 'No se pudo bloquear') } finally { setGuardando(false) }
  }
  return (
    <Modal title="Bloquear horario" onClose={onClose}>
      <div className="space-y-3">
        <Sel label="Profesional" value={doc} onChange={setDoc} options={doctores.map((d) => ({ v: d.id, l: d.name ?? d.email ?? '' }))} />
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Desde</span>
            <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" /></label>
          <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Hasta</span>
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" /></label>
        </div>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      </div>
      <div className="flex gap-2 pt-5">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Guardando…' : 'Bloquear'}</button>
      </div>
    </Modal>
  )
}

// ── Helpers UI ──
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  )
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
}
