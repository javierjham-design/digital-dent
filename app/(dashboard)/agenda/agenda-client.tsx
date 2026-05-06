'use client'

import { useCallback, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg, DateSelectArg } from '@fullcalendar/core'
import { formatDateTime } from '@/lib/utils'

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: '#f59e0b',
  CONFIRMADA: '#0891b2',
  ATENDIDA: '#10b981',
  CANCELADA: '#ef4444',
  NO_ASISTIO: '#6b7280',
}

const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'CANCELADA', 'NO_ASISTIO']
const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', ATENDIDA: 'Atendida', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistió',
}

interface Cita {
  id: string; title: string; start: string; end: string
  estado: string; tipo: string; doctor: string | null
  pacienteId: string; doctorId: string; notas: string
}

interface Props {
  citas: Cita[]
  doctors: { id: string; name: string | null; email: string }[]
}

export function AgendaClient({ citas, doctors }: Props) {
  const calRef = useRef<FullCalendar>(null)
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [updating, setUpdating] = useState(false)

  const events = citas.map((c) => ({
    id: c.id,
    title: c.title,
    start: c.start,
    end: c.end,
    backgroundColor: ESTADO_COLORS[c.estado] ?? '#0891b2',
    borderColor: ESTADO_COLORS[c.estado] ?? '#0891b2',
    extendedProps: c,
  }))

  const handleEventClick = useCallback((info: EventClickArg) => {
    setSelectedCita(info.event.extendedProps as Cita)
    setShowDetail(true)
  }, [])

  async function updateEstado(citaId: string, estado: string) {
    setUpdating(true)
    await fetch(`/api/citas/${citaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    setUpdating(false)
    setShowDetail(false)
    window.location.reload()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de citas y calendario</p>
        </div>
        {/* Leyenda estados */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(ESTADO_COLORS).map(([estado, color]) => (
            <div key={estado} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              {ESTADO_LABELS[estado]}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale={esLocale}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={events}
          eventClick={handleEventClick}
          selectable={true}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          height="auto"
          nowIndicator={true}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        />
      </div>

      {/* Modal detalle cita */}
      {showDetail && selectedCita && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedCita.title}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{formatDateTime(selectedCita.start)}</p>
              </div>
              <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Doctor</dt>
                  <dd className="font-medium text-slate-900">{selectedCita.doctor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tipo</dt>
                  <dd className="font-medium text-slate-900">{selectedCita.tipo}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Estado actual</dt>
                  <dd>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${ESTADO_COLORS[selectedCita.estado]}20`, color: ESTADO_COLORS[selectedCita.estado] }}>
                      {ESTADO_LABELS[selectedCita.estado]}
                    </span>
                  </dd>
                </div>
                {selectedCita.notas && (
                  <div>
                    <dt className="text-slate-500 mb-1">Notas</dt>
                    <dd className="text-slate-700 bg-slate-50 p-3 rounded-lg">{selectedCita.notas}</dd>
                  </div>
                )}
              </dl>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Cambiar estado:</p>
                <div className="grid grid-cols-2 gap-2">
                  {ESTADOS.map((e) => (
                    <button
                      key={e}
                      onClick={() => updateEstado(selectedCita.id, e)}
                      disabled={updating || e === selectedCita.estado}
                      className="px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-50"
                      style={{
                        borderColor: ESTADO_COLORS[e],
                        color: ESTADO_COLORS[e],
                        backgroundColor: e === selectedCita.estado ? `${ESTADO_COLORS[e]}15` : 'white',
                      }}
                    >
                      {ESTADO_LABELS[e]}
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
