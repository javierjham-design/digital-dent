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
import { agendaOnlineService, type ReservaOnline } from '@/services/agenda-online.service'
import { ApiError } from '@/services/api'
import { PacienteBuscador } from '@/components/PacienteBuscador'
import { RutField } from '@/components/RutField'
import { validarDoc } from '@shared/constants/paises'
import { paisMoneda } from '@/lib/money'

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

type Vista = 'semanal' | 'diaria' | 'global'

export function Agenda() {
  const calRef = useRef<FullCalendar>(null)
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [citas, setCitas] = useState<CitaDTO[]>([])
  const [bloqueos, setBloqueos] = useState<BloqueoDTO[]>([])
  const [horarios, setHorarios] = useState<HorarioDTO[]>([])
  const [horariosTodos, setHorariosTodos] = useState<HorarioDTO[]>([])
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)

  const [vista, setVista] = useState<Vista>('diaria')
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [doctorId, setDoctorId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(Object.keys(CITA_ESTADOS)))

  const [selected, setSelected] = useState<CitaDTO | null>(null)
  const [selectedBloqueo, setSelectedBloqueo] = useState<BloqueoDTO | null>(null)
  const [crear, setCrear] = useState<null | { slotISO: string; doctorId?: string }>(null)
  const [bloqueoForm, setBloqueoForm] = useState(false)
  const [slotAccion, setSlotAccion] = useState<null | { slotISO: string }>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const [pendientes, setPendientes] = useState<ReservaOnline[]>([])
  const [verPendientes, setVerPendientes] = useState(false)
  // Reagendamiento por arrastre pendiente de confirmar (semanal y global).
  const [pendienteMove, setPendienteMove] = useState<null | { cita: CitaDTO; nuevoDoctorId: string; nuevoISO: string; duracion: number; revert?: () => void }>(null)
  // Cita en proceso de reprogramar con el selector de disponibilidad semanal.
  const [reagendar, setReagendar] = useState<CitaDTO | null>(null)

  function notify(t: string, ok = true) { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  // Carga inicial: doctores (los pacientes se buscan en el servidor al crear cita).
  useEffect(() => {
    // Por defecto se muestran TODOS los profesionales (doctorId vacío); la vista
    // inicial es la diaria (lista), donde "Todos" es una opción válida.
    usuariosService.doctores().then(setDoctores).catch(() => {})
    clinicaService.obtener().then(setClinica).catch(() => {})
    // Todos los horarios de atención (para la vista Global: qué profesionales
    // atienden cada día y en qué franjas).
    horariosLectura.listar().then(setHorariosTodos).catch(() => {})
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
    // Traemos todos los bloqueos del rango; el filtro por profesional se aplica en
    // cliente (la vista Global necesita verlos de todos los profesionales).
    bloqueosService.listar(rango.from, rango.to).then(setBloqueos).catch(() => {})
    if (doctorId) horariosLectura.listar(doctorId).then(setHorarios).catch(() => {})
  }, [rango.from, rango.to, doctorId])

  useEffect(() => { recargar() }, [recargar])

  // Reservas online por confirmar (origen ONLINE + estado PENDIENTE), para el aviso.
  const cargarPendientes = useCallback(() => {
    agendaOnlineService.reservas().then((rs) => setPendientes(rs.filter((r) => r.estado === 'PENDIENTE'))).catch(() => {})
  }, [])
  useEffect(() => { cargarPendientes() }, [cargarPendientes])

  async function confirmarReserva(id: string) {
    try { await citasService.cambiarEstado(id, 'CONFIRMADA'); notify('Reserva confirmada'); cargarPendientes(); recargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'No se pudo confirmar', false) }
  }
  async function rechazarReserva(id: string) {
    if (!confirm('¿Cancelar esta reserva? El cupo quedará libre.')) return
    try { await citasService.cambiarEstado(id, 'CANCELADA'); notify('Reserva cancelada'); cargarPendientes(); recargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

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

  // Devuelve un mensaje si el horario destino choca con otra cita (que ocupa) o un
  // bloqueo del profesional; null si está libre. Sirve para impedir reagendar
  // sobre espacios ya tomados. Las citas en sobrecupo no ocupan de forma exclusiva.
  const conflictoEn = useCallback((doctorId: string, iniISO: string, durMin: number, excluirCitaId: string): string | null => {
    const ini = new Date(iniISO).getTime()
    const fin = ini + durMin * 60000
    const solapa = (aIni: number, aFin: number) => ini < aFin && aIni < fin
    for (const c of citas) {
      if (c.id === excluirCitaId || c.doctorId !== doctorId) continue
      if (c.sobrecupo || ESTADOS_NO_OCUPAN.includes(c.estado)) continue
      if (solapa(+new Date(c.inicio), +new Date(c.fin))) return `Ese horario choca con la cita de ${c.pacienteNombre} (${hora(c.inicio)}–${hora(c.fin)}). Elige otro horario.`
    }
    for (const b of bloqueos) {
      if (b.doctorId !== doctorId) continue
      if (solapa(+new Date(b.inicio), +new Date(b.fin))) return `Ese horario está bloqueado${b.motivo ? ` (${b.motivo})` : ''}.`
    }
    return null
  }, [citas, bloqueos])

  // Arrastrar una cita (semanal) → NO se guarda directo: pide confirmación con la
  // nueva fecha/hora. Si el destino está ocupado, se rechaza y se revierte.
  const onDrop = useCallback((arg: MoveArg) => {
    const props = arg.event.extendedProps as { kind: string; cita?: CitaDTO }
    if (props.kind !== 'cita' || !props.cita || !arg.event.start) { arg.revert(); return }
    const start = arg.event.start
    const end = arg.event.end
    const cita = props.cita
    const duracion = end
      ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
      : Math.max(15, Math.round((+new Date(cita.fin) - +new Date(cita.inicio)) / 60000))
    if (!cita.sobrecupo) {
      const conf = conflictoEn(cita.doctorId, start.toISOString(), duracion, cita.id)
      if (conf) { notify(conf, false); arg.revert(); return }
    }
    setPendienteMove({ cita, nuevoDoctorId: cita.doctorId, nuevoISO: start.toISOString(), duracion, revert: arg.revert })
  }, [conflictoEn])

  // Redimensionar (cambiar duración) sí se aplica directo: es menos propenso a error.
  const onResize = useCallback(async (arg: MoveArg) => {
    const props = arg.event.extendedProps as { kind: string; cita?: CitaDTO }
    if (props.kind !== 'cita' || !props.cita || !arg.event.start || !arg.event.end) { arg.revert(); return }
    const duracion = Math.max(15, Math.round((arg.event.end.getTime() - arg.event.start.getTime()) / 60000))
    try {
      await citasService.editar(props.cita.id, { fecha: arg.event.start.toISOString(), duracion })
      notify('Duración actualizada'); recargar()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'No se pudo ajustar', false); arg.revert()
    }
  }, [recargar])

  async function confirmarMove() {
    if (!pendienteMove) return
    const { cita, nuevoDoctorId, nuevoISO, duracion } = pendienteMove
    try {
      await citasService.editar(cita.id, { fecha: nuevoISO, duracion, ...(nuevoDoctorId !== cita.doctorId ? { doctorId: nuevoDoctorId } : {}) })
      notify('Cita reagendada'); setPendienteMove(null); recargar()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'No se pudo reagendar', false)
      pendienteMove.revert?.(); setPendienteMove(null)
    }
  }
  function cancelarMove() { pendienteMove?.revert?.(); setPendienteMove(null) }

  // Reagendar/reprogramar desde el selector de disponibilidad. Puede lanzar
  // (ApiError) para que el modal muestre el error inline; los cupos ya vienen
  // pre-filtrados como libres, el backend es el guardián final.
  async function reagendarCita(cita: CitaDTO, campos: { fechaISO: string; doctorId: string; duracion: number; sobrecupo: boolean }) {
    await citasService.editar(cita.id, { fecha: campos.fechaISO, duracion: campos.duracion, sobrecupo: campos.sobrecupo, ...(campos.doctorId !== cita.doctorId ? { doctorId: campos.doctorId } : {}) })
    notify(campos.sobrecupo ? 'Cita reagendada en sobrecupo' : 'Cita reagendada'); setReagendar(null); recargar()
  }

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

  // Para la vista Global mostramos TODOS los profesionales (ignora el filtro de
  // profesional del sidebar), sólo respetando el filtro de estados y el día.
  const citasGlobal = useMemo(() => {
    const d0 = new Date(currentDate); d0.setHours(0, 0, 0, 0)
    const d1 = new Date(currentDate); d1.setHours(23, 59, 59, 999)
    return citas.filter((c) => statusFilter.has(c.estado) && (() => { const t = new Date(c.inicio); return t >= d0 && t <= d1 })())
  }, [citas, statusFilter, currentDate])

  const bloqueosGlobal = useMemo(() => {
    const d0 = new Date(currentDate); d0.setHours(0, 0, 0, 0)
    const d1 = new Date(currentDate); d1.setHours(23, 59, 59, 999)
    return bloqueos.filter((b) => { const t = new Date(b.inicio); return t >= d0 && t <= d1 })
  }, [bloqueos, currentDate])

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
        {/* Aviso de reservas online por confirmar */}
        {pendientes.length > 0 && (
          <button onClick={() => setVerPendientes(true)}
            className="w-full mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors">
            <span className="text-sm font-semibold flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" /></span>
              {pendientes.length} reserva{pendientes.length === 1 ? '' : 's'} online por confirmar
            </span>
            <span className="text-xs font-semibold">Ver y confirmar →</span>
          </button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDate(-1)} className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50">‹</button>
            <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setCurrentDate(d) }} className="text-xs font-semibold border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">Hoy</button>
            <button onClick={() => shiftDate(1)} className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50">›</button>
            <span className="text-sm font-semibold text-slate-800 capitalize ml-1">{labelFecha}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['diaria', 'global', 'semanal'] as Vista[]).map((v) => (
                <button key={v} onClick={() => { setVista(v); if (v === 'semanal' && !doctorId) setDoctorId(doctores[0]?.id ?? '') }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md ${vista === v ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500'}`}>
                  {v === 'diaria' ? 'Diaria' : v === 'global' ? 'Global' : 'Semanal'}
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
              .fc .fc-timegrid-event .fc-event-main { padding: 2px 5px; height: 100%; }
              .fc .fc-event-title { white-space: normal; font-weight: 600; font-size: 0.78rem; line-height: 1.12; }
              /* Que el bloque ocupe TODO el ancho de la celda (sin el margen derecho
                 que FullCalendar deja por defecto) y todo su alto. */
              .fc .fc-timegrid-col-events { margin: 0 !important; }
              .fc .fc-timegrid-event-harness { margin-right: 0 !important; right: 1px !important; }
              .fc .fc-timegrid-event-harness-inset .fc-timegrid-event { box-shadow: none; }
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
              eventResize={onResize}
              dateClick={(a) => setSlotAccion({ slotISO: a.date.toISOString() })}
              businessHours={businessHours}
              slotMinTime="07:00:00" slotMaxTime="21:00:00" slotDuration="00:15:00" slotLabelInterval="00:15:00"
              allDaySlot={false} height="auto" nowIndicator expandRows
              displayEventTime={false} eventMinHeight={32}
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            />
          </div>
        ) : vista === 'global' ? (
          <DiariaGlobal doctores={doctores} horarios={horariosTodos} citas={citasGlobal} bloqueos={bloqueosGlobal} fecha={currentDate}
            conflicto={conflictoEn}
            onCita={setSelected} onBloqueo={setSelectedBloqueo}
            onSlot={(docId, slotISO) => setCrear({ slotISO, doctorId: docId })}
            onMover={(cita, nuevoDoctorId, nuevoISO, duracion) => {
              if (!cita.sobrecupo) {
                const conf = conflictoEn(nuevoDoctorId, nuevoISO, duracion, cita.id)
                if (conf) { notify(conf, false); return }
              }
              setPendienteMove({ cita, nuevoDoctorId, nuevoISO, duracion })
            }} />
        ) : (
          <DiariaLista citas={citasDelDia} clinica={clinica} onClick={setSelected} onAvanzar={(c) => { const n = siguienteEstado(c.estado); if (n) cambiarEstado(c.id, n.estado) }} />
        )}
      </div>

      {crear && (
        <CrearCitaModal slotISO={crear.slotISO} doctorId={crear.doctorId || doctorId || doctores[0]?.id || ''} doctores={doctores}
          onClose={() => setCrear(null)}
          onCreated={() => { setCrear(null); notify('Cita agendada'); recargar() }}
          onError={(m) => notify(m, false)} />
      )}
      {selected && (
        <CitaDetalle cita={selected} clinica={clinica} onClose={() => setSelected(null)} onEstado={cambiarEstado} onEliminar={eliminarCita} onReagendar={(c) => { setSelected(null); setReagendar(c) }} />
      )}
      {reagendar && (
        <ReagendarModal cita={reagendar} doctores={doctores} horarios={horariosTodos} onReagendar={reagendarCita} onClose={() => setReagendar(null)} />
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
      {verPendientes && (
        <ReservasPendientesModal reservas={pendientes} onConfirmar={confirmarReserva} onRechazar={rechazarReserva} onClose={() => setVerPendientes(false)} />
      )}
      {pendienteMove && (
        <ConfirmarMoveModal mov={pendienteMove} doctores={doctores} onConfirmar={confirmarMove} onCancelar={cancelarMove} />
      )}
    </div>
  )
}

// ── Modal: confirmar reagendamiento por arrastre ──
function ConfirmarMoveModal({ mov, doctores, onConfirmar, onCancelar }: {
  mov: { cita: CitaDTO; nuevoDoctorId: string; nuevoISO: string; duracion: number }
  doctores: DoctorDTO[]; onConfirmar: () => void; onCancelar: () => void
}) {
  const nuevoInicio = new Date(mov.nuevoISO)
  const nuevoFin = new Date(nuevoInicio.getTime() + mov.duracion * 60000)
  const nombreDoc = (id: string) => doctores.find((d) => d.id === id)?.name ?? '—'
  const cambiaDoc = mov.nuevoDoctorId !== mov.cita.doctorId
  const fmt = (d: Date) => d.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <Modal title="Confirmar reagendamiento" onClose={onCancelar}>
      <p className="text-sm text-slate-600 mb-4">¿Mover la cita de <span className="font-semibold text-slate-800">{mov.cita.pacienteNombre}</span> a este nuevo horario?</p>
      <div className="space-y-2 mb-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Antes</p>
          <p className="text-sm text-slate-600 capitalize">{fmt(new Date(mov.cita.inicio))} h</p>
          <p className="text-xs text-slate-500">{mov.cita.doctor ?? '—'}</p>
        </div>
        <div className="rounded-xl border-2 border-cyan-300 bg-cyan-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-cyan-500">Ahora</p>
          <p className="text-sm font-semibold text-cyan-800 capitalize">{fmt(nuevoInicio)} – {nuevoFin.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })} h</p>
          <p className={`text-xs ${cambiaDoc ? 'font-semibold text-cyan-700' : 'text-slate-500'}`}>{nombreDoc(mov.nuevoDoctorId)}{cambiaDoc ? ' (cambia de profesional)' : ''}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={onConfirmar} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Confirmar cambio</button>
      </div>
    </Modal>
  )
}

// ── Modal: reservas online por confirmar ──
function ReservasPendientesModal({ reservas, onConfirmar, onRechazar, onClose }: {
  reservas: ReservaOnline[]; onConfirmar: (id: string) => void; onRechazar: (id: string) => void; onClose: () => void
}) {
  return (
    <Modal title={`Reservas online por confirmar (${reservas.length})`} onClose={onClose}>
      {reservas.length === 0 ? <p className="text-sm text-slate-500">No hay reservas pendientes. ¡Todo confirmado!</p> : (
        <div className="divide-y divide-slate-100 max-h-[65vh] overflow-y-auto">
          {reservas.map((r) => {
            const wa = r.paciente.telefono ? `https://wa.me/${r.paciente.telefono.replace(/\D/g, '')}` : null
            return (
              <div key={r.id} className="py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{r.paciente.nombre} {r.paciente.apellido}</p>
                  {r.abonoRequerido && (
                    r.abonoPagado
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Abono pagado</span>
                      : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ Pago pendiente</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 capitalize">
                  {new Date(r.fecha).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })} h · {r.duracion} min
                </p>
                <p className="text-xs text-slate-500">{r.doctor.name ?? '—'}{r.paciente.telefono ? ` · ${r.paciente.telefono}` : ''}{r.paciente.rut ? ` · ${r.paciente.rut}` : ''}</p>
                {r.notas && <p className="text-xs text-slate-400 mt-0.5">{r.notas}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => onConfirmar(r.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">Confirmar</button>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold rounded-lg">WhatsApp</a>}
                  <button onClick={() => onRechazar(r.id)} className="ml-auto px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-rose-600 text-xs font-semibold rounded-lg">Cancelar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
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

// ── Vista Diaria Global (estilo Dentalink): un profesional por columna ─────────
const G_SLOT_H = 20          // px por bloque de 15 min → 80px por hora
const G_PXMIN = G_SLOT_H / 15

type GEvento =
  | { kind: 'cita'; id: string; ini: Date; fin: Date; cita: CitaDTO }
  | { kind: 'bloqueo'; id: string; ini: Date; fin: Date; bloqueo: BloqueoDTO }

// Reparte en "carriles" los eventos que se solapan, para mostrarlos lado a lado.
function conCarriles<T extends { ini: Date; fin: Date }>(evs: T[]): (T & { lane: number; lanes: number })[] {
  const ordenados = [...evs].sort((a, b) => +a.ini - +b.ini)
  const res: (T & { lane: number; lanes: number })[] = []
  let grupo: (T & { lane: number; lanes: number })[] = []
  let grupoFin = 0
  const cerrar = () => { const n = grupo.reduce((m, e) => Math.max(m, e.lane + 1), 1); for (const e of grupo) e.lanes = n; res.push(...grupo); grupo = []; grupoFin = 0 }
  for (const e of ordenados) {
    if (grupo.length && +e.ini >= grupoFin) cerrar()
    const usados = new Set(grupo.filter((g) => +g.fin > +e.ini).map((g) => g.lane))
    let lane = 0; while (usados.has(lane)) lane++
    const item = { ...e, lane, lanes: 1 }
    grupo.push(item); grupoFin = Math.max(grupoFin, +e.fin)
  }
  if (grupo.length) cerrar()
  return res
}

function minutosDelDia(d: Date): number { return d.getHours() * 60 + d.getMinutes() }
const hhmmAMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
const dosDig = (n: number) => String(n).padStart(2, '0')
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
// Lunes (00:00) de la semana que contiene la fecha dada.
function lunesDe(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r }

// Bloques de atención (verde) de un profesional un día concreto, descontando el receso.
function bloquesAtencion(h: HorarioDTO | undefined): [number, number][] {
  if (!h || !h.activo) return []
  const ini = hhmmAMin(h.horaInicio), fin = hhmmAMin(h.horaFin)
  if (h.recesoActivo && h.recesoInicio && h.recesoFin && hhmmAMin(h.recesoInicio) < hhmmAMin(h.recesoFin)) {
    return [[ini, hhmmAMin(h.recesoInicio)], [hhmmAMin(h.recesoFin), fin]]
  }
  return [[ini, fin]]
}

function DiariaGlobal({ doctores, horarios, citas, bloqueos, fecha, conflicto, onCita, onBloqueo, onSlot, onMover }: {
  doctores: DoctorDTO[]; horarios: HorarioDTO[]; citas: CitaDTO[]; bloqueos: BloqueoDTO[]; fecha: Date
  conflicto: (doctorId: string, iniISO: string, durMin: number, excluirCitaId: string) => string | null
  onCita: (c: CitaDTO) => void; onBloqueo: (b: BloqueoDTO) => void; onSlot: (doctorId: string, slotISO: string) => void
  onMover: (cita: CitaDTO, nuevoDoctorId: string, nuevoISO: string, duracion: number) => void
}) {
  const dow = fecha.getDay() // 0=domingo … 6=sábado (misma convención que horario.diaSemana)
  const dragRef = useRef<{ cita: CitaDTO; duracion: number } | null>(null)
  const [dropHint, setDropHint] = useState<{ docId: string; min: number; ocupado: boolean } | null>(null)

  // Horarios de atención del día (por profesional).
  const horariosDia = useMemo(() => horarios.filter((h) => h.diaSemana === dow && h.activo), [horarios, dow])
  const horarioDe = (docId: string) => horariosDia.find((h) => h.doctorId === docId)

  // Profesionales a mostrar: SOLO los que atienden ese día (tienen horario activo)
  // o los que ya tienen citas/bloqueos ese día (para no ocultar agenda existente).
  const doctoresMostrar = useMemo(() => {
    const conAgenda = new Set(horariosDia.map((h) => h.doctorId))
    const conEventos = new Set<string>([...citas.map((c) => c.doctorId), ...bloqueos.map((b) => b.doctorId)])
    return doctores.filter((d) => conAgenda.has(d.id) || conEventos.has(d.id))
  }, [doctores, horariosDia, citas, bloqueos])

  // Ventana horaria visible: se ajusta al horario de atención + citas del día.
  const { startM, endM } = useMemo(() => {
    let a = Infinity, b = -Infinity
    for (const h of horariosDia) if (doctoresMostrar.some((d) => d.id === h.doctorId)) { a = Math.min(a, hhmmAMin(h.horaInicio)); b = Math.max(b, hhmmAMin(h.horaFin)) }
    for (const c of citas) { a = Math.min(a, minutosDelDia(new Date(c.inicio))); b = Math.max(b, minutosDelDia(new Date(c.fin))) }
    for (const bl of bloqueos) { a = Math.min(a, minutosDelDia(new Date(bl.inicio))); b = Math.max(b, minutosDelDia(new Date(bl.fin))) }
    if (!Number.isFinite(a)) { a = 8 * 60; b = 20 * 60 }
    let s = Math.floor(a / 60) * 60, e = Math.ceil(b / 60) * 60
    s = Math.max(6 * 60, s); e = Math.min(22 * 60, e); if (e <= s + 60) e = Math.min(22 * 60, s + 120)
    return { startM: s, endM: e }
  }, [horariosDia, doctoresMostrar, citas, bloqueos])

  const totalH = (endM - startM) * G_PXMIN
  const horas = useMemo(() => { const r: number[] = []; for (let m = Math.ceil(startM / 60) * 60; m <= endM; m += 60) r.push(m); return r }, [startM, endM])
  const yDeMin = (m: number) => (Math.max(startM, Math.min(endM, m)) - startM) * G_PXMIN

  // Minuto (redondeado a 15) según la posición Y del cursor dentro de la columna.
  const minEnY = (e: { clientY: number; currentTarget: HTMLElement }) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const min = startM + Math.round((y / G_PXMIN) / 15) * 15
    return Math.max(startM, Math.min(endM - 15, min))
  }
  const isoDeMin = (min: number) => { const d = new Date(fecha); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d.toISOString() }

  if (doctoresMostrar.length === 0) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">Ningún profesional atiende este día.</div>
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
      <p className="text-[11px] text-slate-400 px-3 pt-2">Arrastra una cita para reagendarla (te pedimos confirmar el nuevo horario).</p>
      <div className="flex min-w-max p-2 pt-1">
        {/* Eje de horas (sticky a la izquierda) */}
        <div className="sticky left-0 z-20 bg-white w-12 shrink-0">
          <div className="h-10 border-b border-slate-200" /> {/* hueco del header */}
          <div className="relative" style={{ height: totalH }}>
            {horas.map((m) => (
              <div key={m} className="absolute right-1.5 -translate-y-1/2 text-[10px] font-mono text-slate-400" style={{ top: yDeMin(m) }}>
                {String(Math.floor(m / 60)).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {/* Una columna por profesional */}
        {doctoresMostrar.map((doc) => {
          const verdes = bloquesAtencion(horarioDe(doc.id))
          const citasDoc: GEvento[] = citas.filter((c) => c.doctorId === doc.id).map((c) => ({ kind: 'cita', id: c.id, ini: new Date(c.inicio), fin: new Date(c.fin), cita: c }))
          const blqDoc: GEvento[] = bloqueos.filter((b) => b.doctorId === doc.id).map((b) => ({ kind: 'bloqueo', id: b.id, ini: new Date(b.inicio), fin: new Date(b.fin), bloqueo: b }))
          const layout = conCarriles<GEvento>([...citasDoc, ...blqDoc])
          return (
            <div key={doc.id} className="w-44 shrink-0 border-l border-slate-200 first:border-l-0">
              <div className="h-10 flex items-center justify-center px-2 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                <span className="text-xs font-semibold text-slate-700 truncate">{doc.name ?? doc.email}</span>
              </div>
              <div className="relative bg-[#eceef1]" style={{ height: totalH }}
                onClick={(e) => onSlot(doc.id, isoDeMin(minEnY(e)))}
                onDragOver={(e) => {
                  const drag = dragRef.current; if (!drag) return; e.preventDefault()
                  const min = minEnY(e)
                  const ocupado = !drag.cita.sobrecupo && conflicto(doc.id, isoDeMin(min), drag.duracion, drag.cita.id) !== null
                  setDropHint((h) => (h?.docId === doc.id && h.min === min && h.ocupado === ocupado ? h : { docId: doc.id, min, ocupado }))
                }}
                onDragLeave={() => setDropHint((h) => (h?.docId === doc.id ? null : h))}
                onDrop={(e) => { e.preventDefault(); const drag = dragRef.current; setDropHint(null); if (!drag) return; onMover(drag.cita, doc.id, isoDeMin(minEnY(e)), drag.duracion); dragRef.current = null }}>
                {/* Franjas de atención (verde) sobre el fondo gris de "fuera de horario" */}
                {verdes.map(([s, ee], i) => (
                  <div key={`v${i}`} className="absolute left-0 right-0 bg-[#dcfce7]" style={{ top: yDeMin(s), height: (Math.min(endM, ee) - Math.max(startM, s)) * G_PXMIN }} />
                ))}
                {/* Líneas de bloque cada 15 min (hora sólida, resto tenue) */}
                {Array.from({ length: Math.round((endM - startM) / 15) + 1 }, (_, i) => startM + i * 15).map((m) => (
                  <div key={m} className={`absolute left-0 right-0 border-t ${m % 60 === 0 ? 'border-slate-300' : 'border-slate-200/60'}`} style={{ top: yDeMin(m) }} />
                ))}
                {/* Indicador de destino al arrastrar (rojo si el horario está ocupado) */}
                {dropHint?.docId === doc.id && (
                  <div className={`absolute left-0 right-0 border-t-2 z-20 pointer-events-none ${dropHint.ocupado ? 'border-rose-500' : 'border-cyan-500'}`} style={{ top: yDeMin(dropHint.min) }}>
                    <span className={`absolute -top-2 left-1 text-[9px] font-mono font-bold bg-white/90 px-1 rounded ${dropHint.ocupado ? 'text-rose-600' : 'text-cyan-600'}`}>
                      {dropHint.ocupado ? 'ocupado' : `${String(Math.floor(dropHint.min / 60)).padStart(2, '0')}:${String(dropHint.min % 60).padStart(2, '0')}`}
                    </span>
                  </div>
                )}
                {/* Eventos */}
                {layout.map((ev) => {
                  const top = yDeMin(minutosDelDia(ev.ini))
                  const alto = Math.max(15, (minutosDelDia(ev.fin) - minutosDelDia(ev.ini)) * G_PXMIN - 1)
                  const wPct = 100 / ev.lanes
                  const style = { top, height: alto, left: `${ev.lane * wPct}%`, width: `calc(${wPct}% - 2px)` } as React.CSSProperties
                  if (ev.kind === 'bloqueo') {
                    return (
                      <button key={ev.id} onClick={(e) => { e.stopPropagation(); onBloqueo(ev.bloqueo) }}
                        className="absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden bg-slate-500 text-slate-100 border border-slate-600" style={style}>
                        <span className="text-[10px] font-semibold block leading-tight truncate">🔒 {ev.bloqueo.motivo ?? 'Bloqueo'}</span>
                      </button>
                    )
                  }
                  const cfg = CITA_ESTADOS[ev.cita.estado]
                  return (
                    <button key={ev.id} draggable
                      onDragStart={() => { dragRef.current = { cita: ev.cita, duracion: Math.max(15, Math.round((+ev.fin - +ev.ini) / 60000)) } }}
                      onDragEnd={() => { dragRef.current = null; setDropHint(null) }}
                      onClick={(e) => { e.stopPropagation(); onCita(ev.cita) }}
                      className="absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden border cursor-move active:opacity-80" style={{ ...style, backgroundColor: cfg?.color ?? '#0891b2', borderColor: cfg?.color ?? '#0891b2', color: '#fff' }}>
                      <span className="text-[10px] font-mono opacity-90 block leading-tight">{hora(ev.cita.inicio)}</span>
                      <span className="text-[11px] font-semibold block leading-tight truncate">{ev.cita.pacienteNombre}</span>
                      {alto > 40 && <span className="text-[10px] opacity-90 block leading-tight truncate">{ev.cita.tipo}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
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

  const rutInvalido = Boolean(nuevo.rut) && !validarDoc(paisMoneda(), nuevo.rut)
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
function CitaDetalle({ cita, clinica, onClose, onEstado, onEliminar, onReagendar }: {
  cita: CitaDTO; clinica: ClinicaConfigDTO | null
  onClose: () => void; onEstado: (id: string, estado: string) => void; onEliminar: (id: string) => void
  onReagendar: (cita: CitaDTO) => void
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

      <button onClick={() => onReagendar(cita)}
        className="w-full mb-3 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold">Reagendar / cambiar duración</button>

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

// ── Modal: reprogramar cita viendo la disponibilidad real de la semana ─────────
function ReagendarModal({ cita, doctores, horarios, onReagendar, onClose }: {
  cita: CitaDTO; doctores: DoctorDTO[]; horarios: HorarioDTO[]
  onReagendar: (cita: CitaDTO, campos: { fechaISO: string; doctorId: string; duracion: number; sobrecupo: boolean }) => Promise<void>
  onClose: () => void
}) {
  const durActual = Math.max(15, Math.round((+new Date(cita.fin) - +new Date(cita.inicio)) / 60000))
  const [doctorId, setDoctorId] = useState(cita.doctorId)
  const [duracion, setDuracion] = useState(durActual)
  const [semana, setSemana] = useState(() => lunesDe(new Date(cita.inicio)))
  const [citasSemana, setCitasSemana] = useState<CitaDTO[]>([])
  const [bloqueosSemana, setBloqueosSemana] = useState<BloqueoDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ahora] = useState(() => Date.now()) // referencia estable para no ofrecer horas pasadas
  const [porConfirmar, setPorConfirmar] = useState<null | { fechaISO: string; sobrecupo: boolean }>(null)

  // Carga citas + bloqueos de la semana visible (para calcular los huecos libres).
  useEffect(() => {
    const from = new Date(semana)
    const to = new Date(semana); to.setDate(to.getDate() + 6); to.setHours(23, 59, 59, 999)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicador de carga al cambiar de semana
    setCargando(true)
    Promise.all([
      citasService.listar(from.toISOString(), to.toISOString()),
      bloqueosService.listar(from.toISOString(), to.toISOString()),
    ]).then(([cs, bs]) => { setCitasSemana(cs); setBloqueosSemana(bs) })
      .catch(() => {}).finally(() => setCargando(false))
  }, [semana])

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(semana); d.setDate(d.getDate() + i); return d }), [semana])

  // Horas libres de un día para el profesional y la duración elegidos.
  function horasLibres(dia: Date): string[] {
    const h = horarios.find((x) => x.doctorId === doctorId && x.diaSemana === dia.getDay() && x.activo)
    if (!h) return []
    const ocupados: [number, number][] = []
    for (const c of citasSemana) {
      if (c.doctorId !== doctorId || c.id === cita.id) continue
      if (c.sobrecupo || ESTADOS_NO_OCUPAN.includes(c.estado)) continue
      const ci = new Date(c.inicio); if (!mismoDia(ci, dia)) continue
      ocupados.push([minutosDelDia(ci), minutosDelDia(new Date(c.fin))])
    }
    for (const b of bloqueosSemana) {
      if (b.doctorId !== doctorId) continue
      const bi = new Date(b.inicio); if (!mismoDia(bi, dia)) continue
      ocupados.push([minutosDelDia(bi), minutosDelDia(new Date(b.fin))])
    }
    const res: string[] = []
    for (const [s, e] of bloquesAtencion(h)) {
      for (let t = s; t + duracion <= e; t += 15) {
        if (ocupados.some(([oi, ofin]) => t < ofin && oi < t + duracion)) continue
        const cuando = new Date(dia); cuando.setHours(Math.floor(t / 60), t % 60, 0, 0)
        if (+cuando < ahora) continue // no ofrecer horas pasadas
        res.push(`${dosDig(Math.floor(t / 60))}:${dosDig(t % 60)}`)
      }
    }
    return res
  }

  // Horas de SOBRECUPO: dentro de la ventana de sobreagendamiento del horario, se
  // pueden ofrecer aunque el hueco esté ocupado (se permite solapar). Se excluyen
  // las que ya aparecen como cupo normal (para no duplicar).
  function horasSobrecupo(dia: Date, libres: string[]): string[] {
    const h = horarios.find((x) => x.doctorId === doctorId && x.diaSemana === dia.getDay() && x.activo)
    if (!h || !h.sobrecupoActivo || !h.sobrecupoInicio || !h.sobrecupoFin) return []
    const winS = hhmmAMin(h.sobrecupoInicio), winE = hhmmAMin(h.sobrecupoFin)
    if (winS >= winE) return []
    // Los bloqueos son barreras duras: no se puede sobre-agendar encima de ellos.
    const blqs: [number, number][] = []
    for (const b of bloqueosSemana) {
      if (b.doctorId !== doctorId) continue
      const bi = new Date(b.inicio); if (!mismoDia(bi, dia)) continue
      blqs.push([minutosDelDia(bi), minutosDelDia(new Date(b.fin))])
    }
    const yaLibres = new Set(libres)
    const res: string[] = []
    for (let t = winS; t + duracion <= winE; t += 15) {
      const hhmm = `${dosDig(Math.floor(t / 60))}:${dosDig(t % 60)}`
      if (yaLibres.has(hhmm)) continue
      if (blqs.some(([bi, bf]) => t < bf && bi < t + duracion)) continue
      const cuando = new Date(dia); cuando.setHours(Math.floor(t / 60), t % 60, 0, 0)
      if (+cuando < ahora) continue
      res.push(hhmm)
    }
    return res
  }

  // Al elegir un cupo NO se aplica de inmediato: se abre la confirmación (evita
  // reagendar por un clic accidental).
  function pedirConfirmacion(dia: Date, hhmm: string, sobrecupo: boolean) {
    const [hh, mm] = hhmm.split(':').map(Number)
    const cuando = new Date(dia); cuando.setHours(hh, mm, 0, 0)
    setPorConfirmar({ fechaISO: cuando.toISOString(), sobrecupo })
  }

  async function confirmar() {
    if (!porConfirmar) return
    setGuardando(true); setError(null)
    try { await onReagendar(cita, { fechaISO: porConfirmar.fechaISO, doctorId, duracion, sobrecupo: porConfirmar.sobrecupo }) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo reagendar la cita.'); setGuardando(false); setPorConfirmar(null) }
  }

  const labelSemana = `${dias[0].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} – ${dias[6].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`

  const nombreDoc = (id: string) => doctores.find((d) => d.id === id)?.name ?? '—'

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Reprogramar cita</h2>
            <p className="text-sm text-slate-500">{cita.pacienteNombre} · actual: <span className="capitalize">{new Date(cita.inicio).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</span> {hora(cita.inicio)}–{hora(cita.fin)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Controles */}
        <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-slate-100">
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Profesional</span>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-52">
              {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
            </select></label>
          <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">Duración</span>
            <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              {Array.from(new Set([...DURACIONES, durActual])).sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} minutos</option>)}
            </select></label>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSemana((s) => { const n = new Date(s); n.setDate(n.getDate() - 7); return n })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">‹ Semana anterior</button>
            <span className="text-sm font-semibold text-slate-700 capitalize min-w-40 text-center">{labelSemana}</span>
            <button onClick={() => setSemana((s) => { const n = new Date(s); n.setDate(n.getDate() + 7); return n })} className="px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">Semana siguiente ›</button>
          </div>
        </div>

        {error && <div className="mx-5 mt-3 text-sm px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}

        {/* Rejilla de disponibilidad por día */}
        <div className="p-4 overflow-auto">
          {cargando ? (
            <p className="text-center text-slate-400 text-sm py-10">Cargando disponibilidad…</p>
          ) : (
            <div className="grid grid-cols-7 gap-2 min-w-[720px]">
              {dias.map((dia) => {
                const libres = horasLibres(dia)
                const sobre = horasSobrecupo(dia, libres)
                const atiende = horarios.some((x) => x.doctorId === doctorId && x.diaSemana === dia.getDay() && x.activo)
                return (
                  <div key={dia.toISOString()} className="min-w-0">
                    <div className="text-center pb-2 mb-1 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-700 capitalize">{dia.toLocaleDateString('es-CL', { weekday: 'short' })}</p>
                      <p className="text-[11px] text-slate-400">{dia.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <div className="space-y-1 max-h-[46vh] overflow-y-auto pr-0.5">
                      {!atiende ? (
                        <p className="text-[11px] text-slate-300 text-center pt-2">No atiende</p>
                      ) : libres.length === 0 && sobre.length === 0 ? (
                        <p className="text-[11px] text-slate-400 text-center pt-2">Sin horas</p>
                      ) : (
                        <>
                          {libres.map((hhmm) => (
                            <button key={hhmm} disabled={guardando} onClick={() => pedirConfirmacion(dia, hhmm, false)}
                              className="w-full py-1.5 rounded-lg text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-600 hover:text-white border border-cyan-100 disabled:opacity-50 transition-colors">{hhmm}</button>
                          ))}
                          {sobre.length > 0 && (
                            <>
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-500 text-center pt-2 pb-0.5">Sobrecupo</p>
                              {sobre.map((hhmm) => (
                                <button key={`s-${hhmm}`} disabled={guardando} onClick={() => pedirConfirmacion(dia, hhmm, true)} title="Sobreagendamiento (permite solaparse)"
                                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-500 hover:text-white border border-amber-200 disabled:opacity-50 transition-colors">{hhmm}</button>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cyan-100 border border-cyan-300" /> Libre</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300" /> Sobrecupo (se solapa)</span>
            <span>· Cupos para {duracion} min.</span>
          </p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar</button>
        </div>
      </div>
    </div>

    {/* Confirmación del nuevo horario (evita reagendar por un clic accidental) */}
    {porConfirmar && (() => {
      const nuevoInicio = new Date(porConfirmar.fechaISO)
      const nuevoFin = new Date(nuevoInicio.getTime() + duracion * 60000)
      const cambiaDoc = doctorId !== cita.doctorId
      const fmt = (d: Date) => d.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPorConfirmar(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900">Confirmar reagendamiento</h2>
              <button onClick={() => setPorConfirmar(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <p className="text-sm text-slate-600 mb-4">¿Mover la cita de <span className="font-semibold text-slate-800">{cita.pacienteNombre}</span> a este nuevo horario?</p>
            <div className="space-y-2 mb-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Antes</p>
                <p className="text-sm text-slate-600 capitalize">{fmt(new Date(cita.inicio))} h</p>
                <p className="text-xs text-slate-500">{cita.doctor ?? '—'}</p>
              </div>
              <div className={`rounded-xl border-2 px-3 py-2 ${porConfirmar.sobrecupo ? 'border-amber-300 bg-amber-50' : 'border-cyan-300 bg-cyan-50'}`}>
                <p className={`text-[11px] uppercase tracking-wide ${porConfirmar.sobrecupo ? 'text-amber-600' : 'text-cyan-500'}`}>Ahora{porConfirmar.sobrecupo ? ' · sobrecupo' : ''}</p>
                <p className={`text-sm font-semibold capitalize ${porConfirmar.sobrecupo ? 'text-amber-800' : 'text-cyan-800'}`}>{fmt(nuevoInicio)} – {nuevoFin.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })} h</p>
                <p className={`text-xs ${cambiaDoc ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{nombreDoc(doctorId)}{cambiaDoc ? ' (cambia de profesional)' : ''}</p>
                {porConfirmar.sobrecupo && <p className="text-xs text-amber-700 mt-1">Se agenda en sobrecupo (permite solaparse con otra cita).</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPorConfirmar(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={confirmar} disabled={guardando} className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 ${porConfirmar.sobrecupo ? 'bg-amber-600 hover:bg-amber-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}>{guardando ? 'Guardando…' : 'Confirmar cambio'}</button>
            </div>
          </div>
        </div>
      )
    })()}
    </>
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
