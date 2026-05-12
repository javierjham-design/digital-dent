'use client'

import { useCallback, useRef, useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg } from '@fullcalendar/core'
import { formatRUT, cn } from '@/lib/utils'

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  PENDIENTE:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
  CONFIRMADA: { label: 'Confirmada', color: '#0891b2', bg: '#cffafe', text: '#155e75' },
  ATENDIDA:   { label: 'Atendida',   color: '#10b981', bg: '#d1fae5', text: '#065f46' },
  CANCELADA:  { label: 'Cancelada',  color: '#ef4444', bg: '#fee2e2', text: '#991b1b' },
  NO_ASISTIO: { label: 'No asistió', color: '#6b7280', bg: '#f3f4f6', text: '#374151' },
}

const MOTIVOS = [
  'Consulta diagnóstico', 'Control', 'Detartaje / Profilaxis',
  'Obturación', 'Endodoncia', 'Exodoncia', 'Ortodoncia',
  'Implante', 'Blanqueamiento', 'Urgencia', 'Otro',
]

const ALL_DURACIONES = [15, 30, 45, 60, 75, 90, 120, 180]
const PREVISIONES    = ['Sin convenio', 'Fonasa A', 'Fonasa B', 'Fonasa C', 'Fonasa D', 'Isapre', 'Particular']

interface CitaLog {
  id: string; tipo: string; detalle: string; userName: string; createdAt: string
}

interface Cita {
  id: string; pacienteNombre: string; pacienteRut: string | null
  pacienteTelefono: string | null; pacienteId: string
  doctorId: string; doctor: string
  start: string; end: string; estado: string; tipo: string; notas: string
  confirmadoWA: boolean
  logs: CitaLog[]
}

interface Horario {
  id: string; doctorId: string; diaSemana: number
  horaInicio: string; horaFin: string; activo: boolean
}

interface ClinicConfig { clinica: string; direccion: string; ciudad: string; mensajeWA: string }

interface Props {
  citas: Cita[]
  doctors: { id: string; name: string | null; email: string }[]
  pacientes: { id: string; rut: string | null; nombre: string; apellido: string; telefono: string | null }[]
  horarios: Horario[]
  config: ClinicConfig
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, bg: '#f3f4f6', text: '#374151' }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.label}</span>
  )
}

// ── WhatsApp helpers ─────────────────────────────────────────────────────
const DIAS_ES  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function buildWAMessage(cita: Cita, cfg: ClinicConfig): string {
  const d      = new Date(cita.start)
  const fecha  = `${DIAS_ES[d.getDay()]} ${d.getDate()} de ${MESES_ES[d.getMonth()]} a las ${formatTime(cita.start)} hrs`
  const nombre = cita.pacienteNombre.split(' ')[0]
  const lugar  = [cfg.direccion, cfg.ciudad].filter(Boolean).join(', ')
  const tmpl   = cfg.mensajeWA || 'Hola {nombre}, te escribimos de *{clinica}* para confirmar tu cita el {fecha} en {direccion}.'
  return tmpl
    .replace(/{nombre}/g,    nombre)
    .replace(/{clinica}/g,   cfg.clinica)
    .replace(/{fecha}/g,     fecha)
    .replace(/{direccion}/g, lugar)
}

function buildWAUrl(phone: string, message: string): string {
  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = num.slice(1)
  if (num.length <= 9) num = '56' + num
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
}

export function AgendaClient({ citas, doctors, pacientes, horarios, config }: Props) {
  const calRef = useRef<FullCalendar>(null)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(Object.keys(ESTADO_CONFIG)))
  const [doctorFilter, setDoctorFilter] = useState('todos')
  const [currentView,  setCurrentView]  = useState<'timeGridWeek' | 'timeGridDay'>('timeGridWeek')
  const [selectedCita,   setSelectedCita]   = useState<Cita | null>(null)
  const [showHistorial,  setShowHistorial]  = useState(false)
  const [updating, setUpdating] = useState(false)
  const [saving,   setSaving]   = useState(false)

  const [darCita, setDarCita] = useState<{
    step: 1 | 2
    slotISO: string
    tipo: string
    duracion: number
    doctorId: string
    mode: 'existente' | 'nuevo'
    search: string
    pacienteId: string
    notas: string
    nuevo: { nombre: string; apellido: string; rut: string; extranjero: boolean; email: string; prevision: string; telefono: string }
  } | null>(null)

  // ── Compute available durations for a clicked slot ───────────────────────
  function getAvailableDuraciones(slotISO: string, doctorId: string): number[] {
    const slot       = new Date(slotISO)
    const dayOfWeek  = slot.getDay()
    const slotMins   = slot.getHours() * 60 + slot.getMinutes()

    // Working hours end for this doctor on this weekday
    const horario = horarios.find(h => h.doctorId === doctorId && h.diaSemana === dayOfWeek && h.activo)
    let endMins = 20 * 60 // fallback: 20:00
    if (horario) endMins = toMinutes(horario.horaFin)

    // Next appointment for this doctor same day after slot
    const next = citas
      .filter(c => c.doctorId === doctorId)
      .filter(c => {
        const d = new Date(c.start)
        return d.toDateString() === slot.toDateString() && d > slot
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0]

    if (next) {
      const nextMins = new Date(next.start).getHours() * 60 + new Date(next.start).getMinutes()
      endMins = Math.min(endMins, nextMins)
    }

    const available = endMins - slotMins
    // Return all durations that fit, rounding available down to nearest 15
    const maxDur = Math.floor(available / 15) * 15
    return ALL_DURACIONES.filter(d => d <= maxDur && d <= available)
  }

  // ── Business hours for FullCalendar ──────────────────────────────────────
  const businessHours = useMemo(() => {
    const filtered = doctorFilter === 'todos'
      ? horarios.filter(h => h.activo)
      : horarios.filter(h => h.doctorId === doctorFilter && h.activo)
    if (filtered.length === 0) return false
    return filtered.map(h => ({
      daysOfWeek: [h.diaSemana],
      startTime: h.horaInicio,
      endTime: h.horaFin,
    }))
  }, [horarios, doctorFilter])

  // ── Filtered calendar events ─────────────────────────────────────────────
  const events = useMemo(() => citas
    .filter(c => statusFilter.has(c.estado) && (doctorFilter === 'todos' || c.doctorId === doctorFilter))
    .map(c => ({
      id: c.id,
      title: (c.confirmadoWA ? '✓ ' : '') + c.pacienteNombre,
      start: c.start, end: c.end,
      backgroundColor: ESTADO_CONFIG[c.estado]?.color ?? '#0891b2',
      borderColor: c.confirmadoWA ? '#15803d' : 'transparent',
      textColor: '#fff',
      extendedProps: c,
    })),
  [citas, statusFilter, doctorFilter])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDateClick = useCallback((info: { date: Date }) => {
    const selectedDoctorId = doctorFilter !== 'todos' ? doctorFilter : (doctors[0]?.id ?? '')
    const available = getAvailableDuraciones(info.date.toISOString(), selectedDoctorId)
    const defaultDur = available.includes(30) ? 30 : (available[0] ?? 30)
    setDarCita({
      step: 1, slotISO: info.date.toISOString(),
      tipo: '', duracion: defaultDur, doctorId: selectedDoctorId,
      mode: 'existente', search: '', pacienteId: '', notas: '',
      nuevo: { nombre: '', apellido: '', rut: '', extranjero: false, email: '', prevision: 'Sin convenio', telefono: '' },
    })
  }, [doctorFilter, doctors, horarios, citas])

  const handleEventClick = useCallback((info: EventClickArg) => {
    setSelectedCita(info.event.extendedProps as Cita)
    setShowHistorial(false)
  }, [])

  function toggleEstado(estado: string) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(estado)) next.delete(estado); else next.add(estado)
      return next
    })
  }

  async function updateEstado(citaId: string, nuevoEstado: string) {
    setUpdating(true)
    await fetch(`/api/citas/${citaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado }),
    })
    setUpdating(false); setSelectedCita(null); window.location.reload()
  }

  async function confirmarWA(cita: Cita) {
    if (!cita.pacienteTelefono) {
      alert('Este paciente no tiene teléfono registrado. Agrega el teléfono en la ficha del paciente.')
      return
    }
    const msg = buildWAMessage(cita, config)
    const url = buildWAUrl(cita.pacienteTelefono, msg)
    window.open(url, '_blank')
    await fetch(`/api/citas/${cita.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmadoWA: true }),
    })
    const newLog: CitaLog = {
      id: Date.now().toString(), tipo: 'WA_ENVIADO',
      detalle: 'Confirmación enviada por WhatsApp',
      userName: 'Tú', createdAt: new Date().toISOString(),
    }
    setSelectedCita(prev => prev ? { ...prev, confirmadoWA: true, logs: [...prev.logs, newLog] } : prev)
  }

  async function saveCita() {
    if (!darCita) return
    setSaving(true)
    try {
      let pacienteId = darCita.pacienteId
      if (darCita.mode === 'nuevo') {
        const res = await fetch('/api/pacientes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rut: darCita.nuevo.rut, nombre: darCita.nuevo.nombre,
            apellido: darCita.nuevo.apellido, email: darCita.nuevo.email || null,
            telefono: darCita.nuevo.telefono || null, prevision: darCita.nuevo.prevision || null,
          }),
        })
        const p = await res.json(); pacienteId = p.id
      }
      await fetch('/api/citas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pacienteId, doctorId: darCita.doctorId,
          fecha: darCita.slotISO, duracion: darCita.duracion,
          tipo: darCita.tipo || 'CONSULTA', notas: darCita.notas || null,
        }),
      })
      setDarCita(null); window.location.reload()
    } finally { setSaving(false) }
  }

  function doctorName(id: string) {
    const d = doctors.find(d => d.id === id)
    return d ? (d.name ?? d.email) : '—'
  }

  const searchResults = useMemo(() => {
    if (!darCita?.search || darCita.search.length < 2) return []
    const q = darCita.search.toLowerCase()
    return pacientes.filter(p =>
      `${p.nombre} ${p.apellido}`.toLowerCase().includes(q) || (p.rut ?? '').toLowerCase().includes(q)
    ).slice(0, 6)
  }, [darCita?.search, pacientes])

  // Available durations for current slot/doctor in step 1
  const availableDuraciones = useMemo(() => {
    if (!darCita) return ALL_DURACIONES
    return getAvailableDuraciones(darCita.slotISO, darCita.doctorId)
  }, [darCita?.slotISO, darCita?.doctorId, horarios, citas])

  const canSave = darCita && (
    (darCita.mode === 'existente' && darCita.pacienteId !== '') ||
    (darCita.mode === 'nuevo' && darCita.nuevo.nombre !== '' && darCita.nuevo.apellido !== '')
  )

  function changeView(view: 'timeGridWeek' | 'timeGridDay') {
    calRef.current?.getApi().changeView(view)
    setCurrentView(view)
  }

  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden bg-slate-50">
      {/* ── LEFT PANEL ── */}
      <div className="w-52 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col gap-5 p-4 overflow-y-auto shadow-sm">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Estado de la cita</p>
          <div className="space-y-2">
            {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => toggleEstado(key)}
                  className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer',
                    statusFilter.has(key) ? 'border-transparent' : 'border-slate-300 bg-white')}
                  style={statusFilter.has(key) ? { backgroundColor: cfg.color, borderColor: cfg.color } : {}}>
                  {statusFilter.has(key) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-slate-600 flex-1">{cfg.label}</span>
                <span className="text-xs text-slate-400">{citas.filter(c => c.estado === key).length}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Profesional</p>
          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="todos">Todos</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
          </select>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl p-3 border border-cyan-100">
          <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wider mb-1">Citas hoy</p>
          <p className="text-3xl font-bold text-cyan-700">
            {citas.filter(c => {
              const d = new Date(c.start); const t = new Date(); t.setHours(0,0,0,0)
              const te = new Date(t); te.setHours(23,59,59,999)
              return d >= t && d <= te
            }).length}
          </p>
        </div>
      </div>

      {/* ── CALENDAR ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Prev / Today / Next */}
            <button onClick={() => calRef.current?.getApi().prev()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => calRef.current?.getApi().today()}
              className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              Hoy
            </button>
            <button onClick={() => calRef.current?.getApi().next()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>

            {/* View toggle */}
            <div className="flex bg-slate-100 rounded-lg p-0.5 ml-2">
              <button
                onClick={() => changeView('timeGridWeek')}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all', currentView === 'timeGridWeek' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                Semana
              </button>
              <button
                onClick={() => changeView('timeGridDay')}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all', currentView === 'timeGridDay' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                Día
              </button>
            </div>
          </div>

          <button onClick={() => handleDateClick({ date: new Date() })}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nueva cita
          </button>
        </div>

        {/* FullCalendar */}
        <div className="flex-1 overflow-auto bg-white">
          <style>{`
            .fc { font-family: inherit; }
            .fc .fc-toolbar { display: none !important; }
            .fc .fc-timegrid-slot { height: 26px !important; }
            .fc .fc-timegrid-slot-label { font-size: 11px; color: #94a3b8; font-weight: 500; }
            .fc .fc-col-header-cell { background: #f8fafc; border-color: #e2e8f0; }
            .fc .fc-col-header-cell-cushion { font-size: 12px; font-weight: 700; color: #475569; padding: 10px 4px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em; }
            .fc-day-today .fc-col-header-cell-cushion { color: #0891b2 !important; }
            .fc-day-today { background: rgba(240,253,254,0.6) !important; }
            .fc-day-today .fc-col-header-cell { background: rgba(207,250,254,0.5) !important; }
            .fc .fc-event { border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; border-left-width: 3px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .fc .fc-event:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(0,0,0,0.15); transition: all 0.15s; }
            .fc .fc-timegrid-now-indicator-line { border-color: #f43f5e; border-width: 2px; }
            .fc .fc-timegrid-now-indicator-arrow { border-color: #f43f5e; }
            .fc td, .fc th { border-color: #f1f5f9 !important; }
            .fc .fc-non-business { background: rgba(248,250,252,0.8); }
            .fc-timegrid-slot-lane { position: relative; cursor: pointer; transition: background 0.1s; }
            .fc-timegrid-slot-lane:hover { background-color: rgba(8,145,178,0.04) !important; }
            .fc-timegrid-slot-lane:hover::after {
              content: '+';
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              font-size: 15px;
              font-weight: 700;
              color: rgba(8,145,178,0.35);
              pointer-events: none;
              line-height: 1;
            }
            .fc-scrollgrid { border: none !important; }
            .fc-scrollgrid-section > td { border: none !important; }
          `}</style>
          <FullCalendar
            ref={calRef}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={esLocale}
            headerToolbar={false}
            events={events}
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            businessHours={businessHours}
            slotDuration="00:15:00"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            allDaySlot={false}
            height="100%"
            nowIndicator={true}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            expandRows={true}
          />
        </div>
      </div>

      {/* ── MODAL: Dar cita — PASO 1 ── */}
      {darCita?.step === 1 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-base font-semibold text-slate-900">Dar cita</h2>
              <button onClick={() => setDarCita(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Profesional */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Profesional</label>
                <select value={darCita.doctorId}
                  onChange={e => {
                    const newDocId = e.target.value
                    const avail = getAvailableDuraciones(darCita.slotISO, newDocId)
                    const defDur = avail.includes(30) ? 30 : (avail[0] ?? 30)
                    setDarCita(d => d ? { ...d, doctorId: newDocId, duracion: defDur } : d)
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
                </select>
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo de la atención</label>
                <select value={darCita.tipo}
                  onChange={e => setDarCita(d => d ? { ...d, tipo: e.target.value } : d)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccione un motivo</option>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Duración — dinámica según disponibilidad */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Duración
                  {availableDuraciones.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      (máx. {availableDuraciones[availableDuraciones.length - 1]} min disponibles)
                    </span>
                  )}
                </label>
                {availableDuraciones.length === 0 ? (
                  <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    No hay tiempo disponible en este horario. Selecciona otro bloque.
                  </p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {availableDuraciones.map(d => (
                      <button key={d} type="button"
                        onClick={() => setDarCita(s => s ? { ...s, duracion: d } : s)}
                        className={cn('px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                          darCita.duracion === d
                            ? 'bg-cyan-600 border-cyan-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-cyan-300')}>
                        {d} min
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setDarCita(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
              <button disabled={availableDuraciones.length === 0}
                onClick={() => setDarCita(d => d ? { ...d, step: 2 } : d)}
                className="px-5 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl font-medium disabled:opacity-40 transition-colors">
                Continuar →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Dar cita — PASO 2 ── */}
      {darCita?.step === 2 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex overflow-hidden" style={{ maxHeight: '90vh' }}>
            {/* Left: radio tabs */}
            <div className="w-52 flex-shrink-0 bg-slate-50 border-r border-slate-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo de paciente</p>
              {(['existente', 'nuevo'] as const).map(mode => (
                <label key={mode}
                  className={cn('flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all',
                    darCita.mode === mode ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
                  <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    darCita.mode === mode ? 'border-cyan-500' : 'border-slate-300')}>
                    {darCita.mode === mode && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
                  </div>
                  <input type="radio" className="sr-only" checked={darCita.mode === mode}
                    onChange={() => setDarCita(d => d ? { ...d, mode, pacienteId: '', search: '' } : d)} />
                  <span className="text-sm font-medium text-slate-700">
                    {mode === 'existente' ? 'Paciente existente' : 'Paciente nuevo'}
                  </span>
                </label>
              ))}
            </div>

            {/* Right: form */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-base font-semibold text-slate-900">Dar cita (agendar)</h2>
                <button onClick={() => setDarCita(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Green banner */}
              <div className="mx-6 mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-emerald-700">
                  <span className="font-medium">Cita — {doctorName(darCita.doctorId)}:</span>{' '}
                  <span className="font-bold bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg">
                    {new Date(darCita.slotISO).toLocaleDateString('es-CL')} {formatTime(darCita.slotISO)}
                  </span>{' '}
                  <span className="text-emerald-600">· {darCita.duracion} min</span>
                </p>
              </div>

              {/* Form */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {darCita.mode === 'existente' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre, apellidos y/o RUT *</label>
                    <div className="relative">
                      <input type="text" placeholder="Buscar paciente..."
                        value={darCita.search}
                        onChange={e => setDarCita(d => d ? { ...d, search: e.target.value, pacienteId: '' } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      {searchResults.length > 0 && darCita.pacienteId === '' && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                          {searchResults.map(p => (
                            <button key={p.id} type="button"
                              onClick={() => setDarCita(d => d ? { ...d, pacienteId: p.id, search: `${p.nombre} ${p.apellido}` } : d)}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                              <p className="text-sm font-medium text-slate-800">{p.nombre} {p.apellido}</p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{p.rut ? formatRUT(p.rut) : 'Sin RUT'}{p.telefono ? ` · ${p.telefono}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {darCita.pacienteId && (
                        <div className="mt-2 flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2">
                          <svg className="w-4 h-4 text-cyan-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="text-sm font-medium text-cyan-700">{darCita.search}</span>
                          <button type="button"
                            onClick={() => setDarCita(d => d ? { ...d, pacienteId: '', search: '' } : d)}
                            className="ml-auto text-cyan-400 hover:text-cyan-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Comentario</label>
                      <input type="text" placeholder="Comentario opcional..." value={darCita.notas}
                        onChange={e => setDarCita(d => d ? { ...d, notas: e.target.value } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre legal *</label>
                        <input type="text" value={darCita.nuevo.nombre}
                          onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, nombre: e.target.value } } : d)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Apellidos *</label>
                        <input type="text" value={darCita.nuevo.apellido}
                          onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, apellido: e.target.value } } : d)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">RUT <span className="text-slate-400 font-normal">(opcional)</span></label>
                      <div className="flex items-center gap-3">
                        <input type="text" placeholder="12345678-9" value={darCita.nuevo.rut}
                          onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, rut: e.target.value } } : d)}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                        <label className="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
                          <input type="checkbox" checked={darCita.nuevo.extranjero}
                            onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, extranjero: e.target.checked } } : d)}
                            className="rounded border-slate-300" />
                          Extranjero
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">E-Mail</label>
                      <input type="email" value={darCita.nuevo.email}
                        onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, email: e.target.value } } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Convenio / Previsión</label>
                      <select value={darCita.nuevo.prevision}
                        onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, prevision: e.target.value } } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                        {PREVISIONES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                      <input type="tel" placeholder="+56 9 1234 5678" value={darCita.nuevo.telefono}
                        onChange={e => setDarCita(d => d ? { ...d, nuevo: { ...d.nuevo, telefono: e.target.value } } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Comentario</label>
                      <input type="text" placeholder="Comentario opcional..." value={darCita.notas}
                        onChange={e => setDarCita(d => d ? { ...d, notas: e.target.value } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm text-slate-500 font-medium">{darCita.duracion} min seleccionados</span>
                <div className="flex gap-3">
                  <button onClick={() => setDarCita(d => d ? { ...d, step: 1 } : d)}
                    className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                    ← Volver
                  </button>
                  <button onClick={saveCita} disabled={!canSave || saving}
                    className="px-5 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl font-medium disabled:opacity-40 transition-colors">
                    {saving ? 'Guardando…' : 'Continuar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Detalle cita ── */}
      {selectedCita && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedCita.pacienteNombre}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{formatTime(selectedCita.start)} — {formatTime(selectedCita.end)}</p>
              </div>
              <button onClick={() => setSelectedCita(null)} className="text-slate-400 hover:text-slate-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">RUT</dt>
                  <dd className="font-medium font-mono text-slate-900">{formatRUT(selectedCita.pacienteRut)}</dd>
                </div>
                {selectedCita.pacienteTelefono && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Teléfono</dt>
                    <dd className="font-medium text-slate-900">{selectedCita.pacienteTelefono}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Profesional</dt>
                  <dd className="font-medium text-slate-900">{selectedCita.doctor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tipo</dt>
                  <dd className="font-medium text-slate-900">{selectedCita.tipo}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-slate-500">Estado</dt>
                  <dd><EstadoBadge estado={selectedCita.estado} /></dd>
                </div>
                {selectedCita.notas && (
                  <div>
                    <dt className="text-slate-500 mb-1.5">Notas</dt>
                    <dd className="text-slate-700 bg-slate-50 p-3 rounded-xl text-sm">{selectedCita.notas}</dd>
                  </div>
                )}
              </dl>

              {/* WhatsApp confirm button */}
              {selectedCita.confirmadoWA ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span className="text-sm font-medium text-emerald-700">Confirmado por WhatsApp</span>
                </div>
              ) : (
                <button onClick={() => confirmarWA(selectedCita)}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Confirmar hora por WhatsApp
                </button>
              )}

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Cambiar estado:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => updateEstado(selectedCita.id, key)}
                      disabled={updating || key === selectedCita.estado}
                      className={cn('px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                        key === selectedCita.estado ? 'cursor-default opacity-60' : 'hover:opacity-90 cursor-pointer')}
                      style={{ borderColor: cfg.color, color: cfg.text, backgroundColor: key === selectedCita.estado ? cfg.bg : 'white' }}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Historial colapsable ── */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowHistorial(h => !h)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Historial
                    <span className="text-xs text-slate-400 font-normal">({selectedCita.logs.length} registros)</span>
                  </span>
                  <svg className={cn('w-4 h-4 text-slate-400 transition-transform', showHistorial && 'rotate-180')}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showHistorial && (
                  <div className="divide-y divide-slate-100">
                    {selectedCita.logs.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-400 italic">Sin registros</p>
                    ) : (
                      [...selectedCita.logs].reverse().map(log => (
                        <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                            log.tipo === 'AGENDADA'   ? 'bg-cyan-100' :
                            log.tipo === 'WA_ENVIADO' ? 'bg-emerald-100' : 'bg-amber-100')}>
                            {log.tipo === 'AGENDADA' && (
                              <svg className="w-3 h-3 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )}
                            {log.tipo === 'WA_ENVIADO' && (
                              <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            )}
                            {log.tipo === 'ESTADO' && (
                              <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700">{log.detalle}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-400">{log.userName}</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-xs text-slate-400">
                                {new Date(log.createdAt).toLocaleDateString('es-CL')} {new Date(log.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
