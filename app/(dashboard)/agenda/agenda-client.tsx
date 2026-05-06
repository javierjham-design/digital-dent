'use client'

import { useState, useMemo } from 'react'
import { formatRUT, cn } from '@/lib/utils'

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  PENDIENTE:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
  CONFIRMADA: { label: 'Confirmada', color: '#0891b2', bg: '#cffafe', text: '#155e75' },
  ATENDIDA:   { label: 'Atendida',   color: '#10b981', bg: '#d1fae5', text: '#065f46' },
  CANCELADA:  { label: 'Cancelada',  color: '#ef4444', bg: '#fee2e2', text: '#991b1b' },
  NO_ASISTIO: { label: 'No asistió', color: '#6b7280', bg: '#f3f4f6', text: '#374151' },
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface Cita {
  id: string
  pacienteNombre: string
  pacienteRut: string
  pacienteTelefono: string | null
  pacienteId: string
  doctorId: string
  doctor: string
  start: string
  end: string
  estado: string
  tipo: string
  notas: string
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
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  )
}

function WeekStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const start = new Date(selectedDate)
  start.setDate(start.getDate() - start.getDay())
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d
  })
  return (
    <div className="grid grid-cols-7 gap-0.5">
      {['D','L','M','M','J','V','S'].map((d, i) => (
        <div key={i} className="text-center text-xs text-slate-400 pb-1">{d}</div>
      ))}
      {days.map((d, i) => {
        const isSel = d.toDateString() === selectedDate.toDateString()
        const isT   = d.toDateString() === today.toDateString()
        return (
          <button key={i} onClick={() => onSelect(new Date(d))}
            className={cn('text-center text-xs py-1.5 rounded-lg font-medium transition-colors',
              isSel ? 'bg-cyan-600 text-white' :
              isT   ? 'bg-cyan-50 text-cyan-700 font-bold' :
                      'text-slate-600 hover:bg-slate-100')}>
            {d.getDate()}
          </button>
        )
      })}
    </div>
  )
}

function CitaRow({ cita, onClick }: { cita: Cita; onClick: () => void }) {
  const cfg = ESTADO_CONFIG[cita.estado] ?? ESTADO_CONFIG.PENDIENTE
  return (
    <div onClick={onClick}
      className="px-6 py-3.5 grid gap-4 items-center hover:bg-blue-50/40 cursor-pointer transition-colors border-b border-slate-100"
      style={{ gridTemplateColumns: '110px 1fr 180px 130px 100px' }}>
      {/* Hora */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
        <div>
          <p className="text-sm font-semibold text-slate-800">{formatTime(cita.start)}</p>
          <p className="text-xs text-slate-400">{formatTime(cita.end)}</p>
        </div>
      </div>
      {/* Paciente */}
      <div>
        <p className="text-sm font-semibold text-slate-800">{cita.pacienteNombre}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
            </svg>
            <span className="font-mono">{formatRUT(cita.pacienteRut)}</span>
          </span>
          {cita.pacienteTelefono && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {cita.pacienteTelefono}
            </span>
          )}
        </div>
      </div>
      {/* Profesional */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-cyan-700">{(cita.doctor?.[0] ?? 'D').toUpperCase()}</span>
        </div>
        <span className="text-sm text-slate-700 truncate">{cita.doctor}</span>
      </div>
      {/* Estado */}
      <EstadoBadge estado={cita.estado} />
      {/* Tipo */}
      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full truncate">{cita.tipo}</span>
    </div>
  )
}

export function AgendaClient({ citas, doctors, pacientes }: Props) {
  const todayBase = new Date(); todayBase.setHours(0,0,0,0)

  const [selectedDate, setSelectedDate] = useState(todayBase)
  const [statusFilter, setStatusFilter]  = useState<Set<string>>(new Set(Object.keys(ESTADO_CONFIG)))
  const [doctorFilter, setDoctorFilter]  = useState('todos')
  const [showNewCita,  setShowNewCita]   = useState(false)
  const [selectedCita, setSelectedCita]  = useState<Cita | null>(null)
  const [updating,  setUpdating]  = useState(false)
  const [saving,    setSaving]    = useState(false)

  const [form, setForm] = useState({
    pacienteId: '', doctorId: '', fecha: '', hora: '09:00', duracion: '30', tipo: 'CONSULTA', notas: '',
  })

  const citasDelDia = useMemo(() => {
    const dayEnd = new Date(selectedDate); dayEnd.setHours(23,59,59,999)
    return citas
      .filter(c => {
        const d = new Date(c.start)
        return d >= selectedDate && d <= dayEnd
          && statusFilter.has(c.estado)
          && (doctorFilter === 'todos' || c.doctorId === doctorFilter)
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  }, [citas, selectedDate, statusFilter, doctorFilter])

  function shiftDay(n: number) {
    setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd })
  }

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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    setUpdating(false)
    setSelectedCita(null)
    window.location.reload()
  }

  async function createCita(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const fechaHora = new Date(`${form.fecha}T${form.hora}:00`)
    await fetch('/api/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pacienteId: form.pacienteId,
        doctorId:   form.doctorId,
        fecha:      fechaHora.toISOString(),
        duracion:   Number(form.duracion),
        tipo:       form.tipo,
        notas:      form.notas || null,
      }),
    })
    setSaving(false)
    setShowNewCita(false)
    window.location.reload()
  }

  const isToday    = selectedDate.toDateString() === todayBase.toDateString()
  const dateLabel  = `${DIAS[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${MESES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── LEFT PANEL ── */}
      <div className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col gap-5 p-4 overflow-y-auto">
        {/* Date navigation */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">
              {MESES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </span>
            <div className="flex gap-0.5">
              <button onClick={() => shiftDay(-7)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => shiftDay(7)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
          <WeekStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
        </div>

        {/* Estado filter */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Estado de la cita</p>
          <div className="space-y-1.5">
            {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleEstado(key)}
                  className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer',
                    statusFilter.has(key) ? 'border-transparent' : 'border-slate-300 bg-white')}
                  style={statusFilter.has(key) ? { backgroundColor: cfg.color, borderColor: cfg.color } : {}}
                >
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

        {/* Doctor filter */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Profesional</p>
          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="todos">Todos</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>{d.name ?? d.email}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDay(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="px-1">
              <h2 className="text-sm font-semibold text-slate-800">{dateLabel}</h2>
              <p className="text-xs text-slate-400">{citasDelDia.length} cita{citasDelDia.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => shiftDay(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            {!isToday && (
              <button onClick={() => setSelectedDate(new Date(todayBase))}
                className="text-xs text-cyan-600 font-medium hover:text-cyan-700 border border-cyan-200 rounded-lg px-3 py-1.5 ml-1 transition-colors">
                Hoy
              </button>
            )}
          </div>
          <button onClick={() => setShowNewCita(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Dar cita
          </button>
        </div>

        {/* Column headers */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex-shrink-0"
          style={{ display: 'grid', gridTemplateColumns: '110px 1fr 180px 130px 100px', gap: '1rem' }}>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hora</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Paciente</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Profesional</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</span>
        </div>

        {/* Citas list */}
        <div className="flex-1 overflow-y-auto bg-white">
          {citasDelDia.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
              <svg className="w-14 h-14 mb-3 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium text-slate-500">No hay citas para este día</p>
              <button onClick={() => setShowNewCita(true)}
                className="mt-3 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                + Agendar una cita
              </button>
            </div>
          ) : (
            citasDelDia.map(c => <CitaRow key={c.id} cita={c} onClick={() => setSelectedCita(c)} />)
          )}
        </div>
      </div>

      {/* ── MODAL: Nueva cita ── */}
      {showNewCita && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Dar cita</h2>
              <button onClick={() => setShowNewCita(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={createCita} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente *</label>
                <select required value={form.pacienteId} onChange={e => setForm(f => ({ ...f, pacienteId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar paciente</option>
                  {pacientes.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.apellido} · {formatRUT(p.rut)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Profesional *</label>
                <select required value={form.doctorId} onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar profesional</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name ?? d.email}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha *</label>
                  <input required type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hora *</label>
                  <input required type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duración</label>
                  <select value={form.duracion} onChange={e => setForm(f => ({ ...f, duracion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="CONSULTA">Consulta</option>
                    <option value="CONTROL">Control</option>
                    <option value="TRATAMIENTO">Tratamiento</option>
                    <option value="URGENCIA">Urgencia</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowNewCita(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium disabled:opacity-50 transition-colors">
                  {saving ? 'Guardando…' : 'Agendar cita'}
                </button>
              </div>
            </form>
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
                    <dd className="text-slate-700 bg-slate-50 p-3 rounded-lg text-sm">{selectedCita.notas}</dd>
                  </div>
                )}
              </dl>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Cambiar estado:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => updateEstado(selectedCita.id, key)}
                      disabled={updating || key === selectedCita.estado}
                      className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                        key === selectedCita.estado ? 'cursor-default opacity-60' : 'hover:opacity-90 cursor-pointer')}
                      style={{
                        borderColor: cfg.color,
                        color: cfg.text,
                        backgroundColor: key === selectedCita.estado ? cfg.bg : 'white',
                      }}>
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
