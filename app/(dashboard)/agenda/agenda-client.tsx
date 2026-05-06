'use client'

import { useCallback, useRef, useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg } from '@fullcalendar/core'
import { formatRUT, formatDate, cn } from '@/lib/utils'

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

const DURACIONES = [15, 30, 45, 60, 90]

const PREVISIONES = ['Sin convenio', 'Fonasa A', 'Fonasa B', 'Fonasa C', 'Fonasa D', 'Isapre', 'Particular']

interface Cita {
  id: string; pacienteNombre: string; pacienteRut: string
  pacienteTelefono: string | null; pacienteId: string
  doctorId: string; doctor: string
  start: string; end: string; estado: string; tipo: string; notas: string
}

interface Props {
  citas: Cita[]
  doctors: { id: string; name: string | null; email: string }[]
  pacientes: { id: string; rut: string; nombre: string; apellido: string; telefono: string | null }[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, bg: '#f3f4f6', text: '#374151' }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.label}</span>
  )
}

export function AgendaClient({ citas, doctors, pacientes }: Props) {
  const calRef = useRef<FullCalendar>(null)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(Object.keys(ESTADO_CONFIG)))
  const [doctorFilter, setDoctorFilter] = useState('todos')
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null)
  const [updating, setUpdating] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── New cita state ──────────────────────────────────────────────────────
  const [darCita, setDarCita] = useState<{
    step: 1 | 2
    slotISO: string           // clicked slot datetime ISO
    tipo: string
    duracion: number
    doctorId: string
    mode: 'existente' | 'nuevo'
    search: string
    pacienteId: string
    notas: string
    nuevo: { nombre: string; apellido: string; rut: string; extranjero: boolean; email: string; prevision: string; telefono: string }
  } | null>(null)

  // ── Filtered events ─────────────────────────────────────────────────────
  const events = useMemo(() => citas
    .filter(c => statusFilter.has(c.estado) && (doctorFilter === 'todos' || c.doctorId === doctorFilter))
    .map(c => ({
      id: c.id,
      title: c.pacienteNombre,
      start: c.start,
      end: c.end,
      backgroundColor: ESTADO_CONFIG[c.estado]?.color ?? '#0891b2',
      borderColor: 'transparent',
      textColor: '#fff',
      extendedProps: c,
    })),
  [citas, statusFilter, doctorFilter])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDateClick = useCallback((info: { date: Date }) => {
    setDarCita({
      step: 1,
      slotISO: info.date.toISOString(),
      tipo: '',
      duracion: 30,
      doctorId: doctorFilter !== 'todos' ? doctorFilter : (doctors[0]?.id ?? ''),
      mode: 'existente',
      search: '',
      pacienteId: '',
      notas: '',
      nuevo: { nombre: '', apellido: '', rut: '', extranjero: false, email: '', prevision: 'Sin convenio', telefono: '' },
    })
  }, [doctorFilter, doctors])

  const handleEventClick = useCallback((info: EventClickArg) => {
    setSelectedCita(info.event.extendedProps as Cita)
  }, [])

  function toggleEstado(estado: string) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(estado)) next.delete(estado); else next.add(estado)
      return next
    })
  }

  async function updateEstado(citaId: string, estado: string) {
    setUpdating(true)
    await fetch(`/api/citas/${citaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    setUpdating(false); setSelectedCita(null); window.location.reload()
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

  // ── Doctor name helper ────────────────────────────────────────────────────
  function doctorName(id: string) {
    const d = doctors.find(d => d.id === id)
    return d ? (d.name ?? d.email) : '—'
  }

  // ── Patient search results ────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!darCita?.search || darCita.search.length < 2) return []
    const q = darCita.search.toLowerCase()
    return pacientes.filter(p =>
      `${p.nombre} ${p.apellido}`.toLowerCase().includes(q) ||
      p.rut.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [darCita?.search, pacientes])

  const canStep2 = darCita && darCita.duracion > 0
  const canSave  = darCita && (
    (darCita.mode === 'existente' && darCita.pacienteId !== '') ||
    (darCita.mode === 'nuevo' && darCita.nuevo.nombre !== '' && darCita.nuevo.apellido !== '' && darCita.nuevo.rut !== '')
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── LEFT PANEL ── */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col gap-5 p-4 overflow-y-auto">
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

        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total hoy</p>
          <p className="text-2xl font-bold text-slate-800">
            {citas.filter(c => {
              const d = new Date(c.start); const t = new Date(); t.setHours(0,0,0,0)
              const te = new Date(t); te.setHours(23,59,59,999)
              return d >= t && d <= te
            }).length}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">citas programadas</p>
        </div>
      </div>

      {/* ── CALENDAR ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => calRef.current?.getApi().prev()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => calRef.current?.getApi().today()}
              className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              Hoy
            </button>
            <button onClick={() => calRef.current?.getApi().next()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="flex gap-1 ml-2">
              <button onClick={() => calRef.current?.getApi().changeView('timeGridWeek')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-600 text-white transition-colors">
                Semanal
              </button>
              <button onClick={() => calRef.current?.getApi().changeView('timeGridDay')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Diaria
              </button>
            </div>
          </div>
          <button onClick={() => handleDateClick({ date: new Date() })}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Dar cita
          </button>
        </div>

        {/* Calendar area */}
        <div className="flex-1 overflow-auto bg-white p-0">
          <style>{`
            .fc { font-family: inherit; }
            .fc .fc-toolbar { display: none !important; }
            .fc .fc-timegrid-slot { height: 28px !important; }
            .fc .fc-timegrid-slot-label { font-size: 11px; color: #94a3b8; }
            .fc .fc-col-header-cell { background: #f8fafc; border-color: #e2e8f0; }
            .fc .fc-col-header-cell-cushion { font-size: 12px; font-weight: 600; color: #475569; padding: 8px 4px; text-decoration: none; }
            .fc .fc-timegrid-axis { font-size: 11px; }
            .fc-day-today .fc-col-header-cell-cushion { color: #0891b2 !important; }
            .fc-day-today { background: #f0fdfe !important; }
            .fc .fc-event { border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer; }
            .fc .fc-event:hover { opacity: 0.85; }
            .fc .fc-timegrid-now-indicator-line { border-color: #ef4444; }
            .fc .fc-timegrid-now-indicator-arrow { border-color: #ef4444; }
            .fc td, .fc th { border-color: #e2e8f0 !important; }
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
            selectable={false}
            slotDuration="00:15:00"
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
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
                <select value={darCita.doctorId} onChange={e => setDarCita(d => d ? { ...d, doctorId: e.target.value } : d)}
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

              {/* Duración */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Duración</label>
                <div className="flex gap-2 flex-wrap">
                  {DURACIONES.map(d => (
                    <button key={d} type="button"
                      onClick={() => setDarCita(s => s ? { ...s, duracion: d } : s)}
                      className={cn('px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                        darCita.duracion === d
                          ? 'bg-cyan-600 border-cyan-600 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-cyan-300')}>
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setDarCita(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
              <button disabled={!canStep2}
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
              <label className={cn('flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all',
                darCita.mode === 'existente' ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
                <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  darCita.mode === 'existente' ? 'border-cyan-500' : 'border-slate-300')}>
                  {darCita.mode === 'existente' && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
                </div>
                <input type="radio" className="sr-only" checked={darCita.mode === 'existente'}
                  onChange={() => setDarCita(d => d ? { ...d, mode: 'existente', pacienteId: '', search: '' } : d)} />
                <span className="text-sm font-medium text-slate-700">Paciente existente</span>
              </label>
              <label className={cn('flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all',
                darCita.mode === 'nuevo' ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
                <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  darCita.mode === 'nuevo' ? 'border-cyan-500' : 'border-slate-300')}>
                  {darCita.mode === 'nuevo' && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
                </div>
                <input type="radio" className="sr-only" checked={darCita.mode === 'nuevo'}
                  onChange={() => setDarCita(d => d ? { ...d, mode: 'nuevo', pacienteId: '' } : d)} />
                <span className="text-sm font-medium text-slate-700">Paciente nuevo</span>
              </label>
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
                  <span className="font-medium">Cita seleccionada — {doctorName(darCita.doctorId)}:</span>
                  {' '}
                  <span className="font-bold bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg">
                    {new Date(darCita.slotISO).toLocaleDateString('es-CL')} {formatTime(darCita.slotISO)}
                  </span>
                </p>
              </div>

              {/* Form area */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {darCita.mode === 'existente' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Nombre, apellidos y/o RUT *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar paciente..."
                        value={darCita.search}
                        onChange={e => setDarCita(d => d ? { ...d, search: e.target.value, pacienteId: '' } : d)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      {searchResults.length > 0 && darCita.pacienteId === '' && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                          {searchResults.map(p => (
                            <button key={p.id} type="button"
                              onClick={() => setDarCita(d => d ? { ...d, pacienteId: p.id, search: `${p.nombre} ${p.apellido}` } : d)}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                              <p className="text-sm font-medium text-slate-800">{p.nombre} {p.apellido}</p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{formatRUT(p.rut)}{p.telefono ? ` · ${p.telefono}` : ''}</p>
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
                          <button type="button" onClick={() => setDarCita(d => d ? { ...d, pacienteId: '', search: '' } : d)}
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
                      <label className="block text-sm font-medium text-slate-700 mb-1">RUT *</label>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
