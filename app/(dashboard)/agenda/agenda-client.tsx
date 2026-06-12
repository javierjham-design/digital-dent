'use client'

import { useCallback, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventClickArg } from '@fullcalendar/core'
import { formatRUT, cn } from '@/lib/utils'
import { CITA_ESTADOS, siguienteEstado } from '@/lib/cita-estados'
import { toast } from '@/components/ui/Toaster'

const ESTADO_CONFIG = CITA_ESTADOS

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
  doctorId: string; doctor: string | null
  start: string; end: string; estado: string; tipo: string; notas: string
  sobrecupo: boolean
  confirmadoWA: boolean
  logs: CitaLog[]
}

interface Horario {
  id: string; doctorId: string; diaSemana: number
  horaInicio: string; horaFin: string; activo: boolean
  recesoActivo?: boolean;    recesoInicio?: string | null;    recesoFin?: string | null
  sobrecupoActivo?: boolean; sobrecupoInicio?: string | null; sobrecupoFin?: string | null
}

interface Bloqueo {
  id: string
  doctorId: string
  doctor: string
  inicio: string
  fin: string
  motivo: string | null
  createdByName: string | null
  googleEventId: string | null
}

type AgendaView = 'diaria' | 'semanal' | 'global'
type AgendaMode = 'base' | 'sobrecupo'

interface ClinicConfig { clinica: string; direccion: string; ciudad: string; mensajeWA: string }

interface Props {
  citas: Cita[]
  doctors: { id: string; name: string | null; email: string | null }[]
  pacientes: { id: string; rut: string | null; nombre: string; apellido: string; telefono: string | null }[]
  horarios: Horario[]
  bloqueos: Bloqueo[]
  isAdmin: boolean
  currentUserId: string
  config: ClinicConfig
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// Convierte un Date al formato que espera <input type="datetime-local">.
function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export function AgendaClient({ citas, doctors, pacientes, horarios, bloqueos, isAdmin, currentUserId, config }: Props) {
  const router = useRouter()
  const calRef = useRef<FullCalendar>(null)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(Object.keys(ESTADO_CONFIG)))
  const [doctorFilter, setDoctorFilter] = useState('todos')
  const [view, setView] = useState<AgendaView>('semanal')
  const [agendaMode, setAgendaMode] = useState<AgendaMode>('base')
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [selectedCita,   setSelectedCita]   = useState<Cita | null>(null)
  const [showHistorial,  setShowHistorial]  = useState(false)
  const [updating, setUpdating] = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Modal de edición / reagendado de cita
  const [editCita, setEditCita] = useState<null | {
    citaId: string
    pacienteNombre: string
    fecha: string      // yyyy-MM-dd
    hora: string       // HH:mm
    duracion: number
    doctorId: string
    tipo: string
    notas: string
  }>(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Bloqueo de agenda
  const [selectedBloqueo, setSelectedBloqueo] = useState<Bloqueo | null>(null)
  const defaultBloqueoDoctorId = isAdmin ? (doctorFilter !== 'todos' ? doctorFilter : (doctors[0]?.id ?? '')) : currentUserId
  const [bloqueoForm, setBloqueoForm] = useState<null | {
    doctorId: string
    inicio: string  // datetime-local format
    fin: string
    motivo: string
  }>(null)
  const [bloqueoError, setBloqueoError] = useState('')
  const [savingBloqueo, setSavingBloqueo] = useState(false)

  // Drawer de filtros mobile
  const [showSidebar, setShowSidebar] = useState(false)

  const [darCita, setDarCita] = useState<{
    step: 1 | 2
    slotISO: string
    tipo: string
    duracion: number
    doctorId: string
    sobrecupo: boolean
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

    // Si el slot está antes de un receso activo, recortamos hasta el inicio del receso
    if (horario?.recesoActivo && horario.recesoInicio && horario.recesoFin) {
      const recIni = toMinutes(horario.recesoInicio)
      const recFin = toMinutes(horario.recesoFin)
      if (slotMins < recIni) {
        endMins = Math.min(endMins, recIni)
      } else if (slotMins >= recIni && slotMins < recFin) {
        // El slot cae dentro del receso → 0 disponible
        return []
      }
    }

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
  // Si el día tiene receso activo, partimos las business hours en dos bloques
  // (antes y después del receso) para que se vea como "fuera de horario".
  const businessHours = useMemo(() => {
    const filtered = doctorFilter === 'todos'
      ? horarios.filter(h => agendaMode === 'sobrecupo' ? h.sobrecupoActivo : h.activo)
      : horarios.filter(h => h.doctorId === doctorFilter && (agendaMode === 'sobrecupo' ? h.sobrecupoActivo : h.activo))
    if (filtered.length === 0) return false
    const blocks: { daysOfWeek: number[]; startTime: string; endTime: string }[] = []
    for (const h of filtered) {
      const ini = agendaMode === 'sobrecupo' ? (h.sobrecupoInicio ?? h.horaInicio) : h.horaInicio
      const fin = agendaMode === 'sobrecupo' ? (h.sobrecupoFin    ?? h.horaFin)    : h.horaFin
      // Solo aplicamos receso en modo base (en sobrecupo se asume sin receso).
      if (agendaMode === 'base' && h.recesoActivo && h.recesoInicio && h.recesoFin) {
        blocks.push({ daysOfWeek: [h.diaSemana], startTime: ini, endTime: h.recesoInicio })
        blocks.push({ daysOfWeek: [h.diaSemana], startTime: h.recesoFin, endTime: fin })
      } else {
        blocks.push({ daysOfWeek: [h.diaSemana], startTime: ini, endTime: fin })
      }
    }
    return blocks
  }, [horarios, doctorFilter, agendaMode])

  // ── Filtered calendar events ─────────────────────────────────────────────
  // Combina citas + bloqueos. Los bloqueos se renderizan en gris oscuro con
  // un patrón distintivo, no hereda los colores de estado.
  const events = useMemo(() => {
    const eventosCita = citas
      .filter(c => statusFilter.has(c.estado) && (doctorFilter === 'todos' || c.doctorId === doctorFilter))
      .filter(c => agendaMode === 'sobrecupo' ? c.sobrecupo : !c.sobrecupo)
      .map(c => ({
        id: `cita-${c.id}`,
        title: (c.confirmadoWA ? '✓ ' : '') + (c.sobrecupo ? '⚠ ' : '') + c.pacienteNombre,
        start: c.start, end: c.end,
        backgroundColor: ESTADO_CONFIG[c.estado]?.color ?? '#0891b2',
        borderColor: c.sobrecupo ? '#f59e0b' : (c.confirmadoWA ? '#15803d' : 'transparent'),
        textColor: '#fff',
        extendedProps: { ...c, __kind: 'cita' as const },
      }))
    // Los bloqueos no entran en modo sobrecupo (no tiene sentido bloquear sobrecupos).
    const eventosBloqueo = agendaMode === 'sobrecupo' ? [] : bloqueos
      .filter(b => doctorFilter === 'todos' || b.doctorId === doctorFilter)
      .map(b => ({
        id: `blq-${b.id}`,
        title: `Bloqueo: ${b.motivo || 'sin motivo'}${doctorFilter === 'todos' ? ` · ${b.doctor}` : ''}`,
        start: b.inicio, end: b.fin,
        backgroundColor: '#475569',
        borderColor: '#334155',
        textColor: '#f1f5f9',
        editable: false,
        extendedProps: { ...b, __kind: 'bloqueo' as const },
      }))
    return [...eventosCita, ...eventosBloqueo]
  }, [citas, bloqueos, statusFilter, doctorFilter, agendaMode])

  // Conteos para badges
  const countBase = useMemo(() => citas.filter(c => !c.sobrecupo).length, [citas])
  const countSobre = useMemo(() => citas.filter(c => c.sobrecupo).length, [citas])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDateClick = useCallback((info: { date: Date; doctorId?: string }) => {
    const selectedDoctorId = info.doctorId ?? (doctorFilter !== 'todos' ? doctorFilter : (doctors[0]?.id ?? ''))
    const available = getAvailableDuraciones(info.date.toISOString(), selectedDoctorId)
    const defaultDur = available.includes(30) ? 30 : (available[0] ?? 30)
    setDarCita({
      step: 1, slotISO: info.date.toISOString(),
      tipo: '', duracion: defaultDur, doctorId: selectedDoctorId,
      sobrecupo: agendaMode === 'sobrecupo',
      mode: 'existente', search: '', pacienteId: '', notas: '',
      nuevo: { nombre: '', apellido: '', rut: '', extranjero: false, email: '', prevision: 'Sin convenio', telefono: '' },
    })
  }, [doctorFilter, doctors, horarios, citas, agendaMode])

  const handleEventClick = useCallback((info: EventClickArg) => {
    const props = info.event.extendedProps as (Cita | Bloqueo) & { __kind?: 'cita' | 'bloqueo' }
    if (props.__kind === 'bloqueo') {
      setSelectedBloqueo(props as Bloqueo)
    } else {
      setSelectedCita(props as Cita)
      setShowHistorial(false)
    }
  }, [])

  function openBloqueoModal(seedDate?: Date) {
    const now = seedDate ?? new Date()
    const dosHorasDespues = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    setBloqueoForm({
      doctorId: defaultBloqueoDoctorId,
      inicio: toDateTimeLocal(now),
      fin: toDateTimeLocal(dosHorasDespues),
      motivo: '',
    })
    setBloqueoError('')
  }

  async function saveBloqueo(e: React.FormEvent) {
    e.preventDefault()
    if (!bloqueoForm) return
    setSavingBloqueo(true); setBloqueoError('')
    try {
      const res = await fetch('/api/bloqueos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: bloqueoForm.doctorId,
          inicio: new Date(bloqueoForm.inicio).toISOString(),
          fin: new Date(bloqueoForm.fin).toISOString(),
          motivo: bloqueoForm.motivo,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setBloqueoError(data.error ?? `Error ${res.status}`); return }
      setBloqueoForm(null)
      toast.success('Horario bloqueado')
      router.refresh()
    } finally { setSavingBloqueo(false) }
  }

  async function deleteBloqueo(id: string) {
    if (!confirm('¿Eliminar este bloqueo? El horario quedará disponible de nuevo.')) return
    const res = await fetch(`/api/bloqueos/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? 'No se pudo eliminar el bloqueo.')
      return
    }
    setSelectedBloqueo(null)
    toast.success('Bloqueo eliminado')
    router.refresh()
  }

  function toggleEstado(estado: string) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(estado)) next.delete(estado); else next.add(estado)
      return next
    })
  }

  async function updateEstado(citaId: string, nuevoEstado: string) {
    setUpdating(true)
    try {
      const res = await fetch(`/api/citas/${citaId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'No se pudo cambiar el estado.')
        return
      }
      toast.success(`Cita marcada como ${ESTADO_CONFIG[nuevoEstado]?.label.toLowerCase() ?? nuevoEstado}`)
      setSelectedCita(null)
      router.refresh()
    } finally { setUpdating(false) }
  }

  function openEditCita(c: Cita) {
    const d = new Date(c.start)
    const pad = (n: number) => String(n).padStart(2, '0')
    setEditCita({
      citaId: c.id,
      pacienteNombre: c.pacienteNombre,
      fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      duracion: Math.round((new Date(c.end).getTime() - d.getTime()) / 60000),
      doctorId: c.doctorId,
      tipo: c.tipo === 'CONSULTA' ? '' : c.tipo,
      notas: c.notas,
    })
    setEditError('')
    setSelectedCita(null)
  }

  async function saveEditCita(e: React.FormEvent) {
    e.preventDefault()
    if (!editCita) return
    setSavingEdit(true); setEditError('')
    try {
      const fechaISO = new Date(`${editCita.fecha}T${editCita.hora}`).toISOString()
      const res = await fetch(`/api/citas/${editCita.citaId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: fechaISO,
          duracion: editCita.duracion,
          doctorId: editCita.doctorId,
          tipo: editCita.tipo || 'CONSULTA',
          notas: editCita.notas || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setEditError(d.error ?? `Error ${res.status}`)
        return
      }
      setEditCita(null)
      toast.success('Cita actualizada')
      router.refresh()
    } finally { setSavingEdit(false) }
  }

  async function confirmarWA(cita: Cita) {
    if (!cita.pacienteTelefono) {
      toast.error('Este paciente no tiene teléfono registrado. Agrégalo en su ficha.')
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
        const p = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(p.error ?? 'No se pudo crear el paciente.')
          return
        }
        pacienteId = p.id
      }
      const res = await fetch('/api/citas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pacienteId, doctorId: darCita.doctorId,
          fecha: darCita.slotISO, duracion: darCita.duracion,
          tipo: darCita.tipo || 'CONSULTA', notas: darCita.notas || null,
          sobrecupo: darCita.sobrecupo,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'No se pudo agendar la cita.')
        return
      }
      setDarCita(null)
      toast.success(darCita.sobrecupo ? 'Sobrecupo agendado' : 'Cita agendada')
      router.refresh()
    } finally { setSaving(false) }
  }

  function doctorName(id: string) {
    const d = doctors.find(d => d.id === id)
    return d ? (d.name ?? d.email) : '—'
  }

  const searchResults = useMemo(() => {
    if (!darCita?.search || darCita.search.length < 2) return []
    // Normaliza tildes para que "Núñez" matchee con "nunez" y viceversa.
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const q = norm(darCita.search)
    return pacientes.filter(p =>
      norm(`${p.nombre} ${p.apellido}`).includes(q) || (p.rut ?? '').toLowerCase().includes(q)
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

  function shiftCurrentDate(dir: -1 | 1) {
    setCurrentDate(prev => {
      const d = new Date(prev)
      const step = view === 'semanal' ? 7 : 1
      d.setDate(d.getDate() + dir * step)
      return d
    })
  }

  function goToToday() {
    const d = new Date(); d.setHours(0, 0, 0, 0); setCurrentDate(d)
  }

  function changeView(v: AgendaView) {
    setView(v)
    if (v === 'semanal' || v === 'diaria') {
      const fcView = v === 'semanal' ? 'timeGridWeek' : 'timeGridDay'
      setTimeout(() => { calRef.current?.getApi().changeView(fcView, currentDate) }, 0)
    }
  }

  // Header label de la vista actual
  const viewLabel = useMemo(() => {
    if (view === 'semanal') {
      const start = new Date(currentDate)
      start.setDate(start.getDate() - start.getDay() + 1) // lunes
      const end = new Date(start); end.setDate(end.getDate() + 6)
      const f = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
      return `${f(start)} al ${f(end)}`
    }
    return currentDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }, [view, currentDate])

  // Citas del día seleccionado (vista lista desktop + diaria global)
  const citasDelDia = useMemo(() => {
    const start = new Date(currentDate); start.setHours(0, 0, 0, 0)
    const end = new Date(currentDate); end.setHours(23, 59, 59, 999)
    return citas
      .filter(c => statusFilter.has(c.estado))
      .filter(c => agendaMode === 'sobrecupo' ? c.sobrecupo : !c.sobrecupo)
      .filter(c => doctorFilter === 'todos' || c.doctorId === doctorFilter)
      .filter(c => {
        const t = new Date(c.start)
        return t >= start && t <= end
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  }, [citas, statusFilter, doctorFilter, currentDate, agendaMode])

  // Bloqueos del día seleccionado (mismo filtro de doctor; sobrecupo no aplica
  // a bloqueos — los bloqueos rigen para la agenda base).
  const bloqueosDelDia = useMemo(() => {
    if (agendaMode === 'sobrecupo') return []
    const start = new Date(currentDate); start.setHours(0, 0, 0, 0)
    const end = new Date(currentDate); end.setHours(23, 59, 59, 999)
    return bloqueos
      .filter(b => doctorFilter === 'todos' || b.doctorId === doctorFilter)
      .filter(b => {
        // Hay solapamiento con el día si el bloqueo arranca o termina en él,
        // o si lo abarca completo.
        const ini = new Date(b.inicio).getTime()
        const fin = new Date(b.fin).getTime()
        return ini <= end.getTime() && fin >= start.getTime()
      })
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
  }, [bloqueos, doctorFilter, currentDate, agendaMode])

  // Doctores que tienen al menos un horario activo este día (para Diaria global)
  const doctorsForGlobal = useMemo(() => {
    const dow = currentDate.getDay()
    return doctors.filter(d => {
      const h = horarios.find(h => h.doctorId === d.id && h.diaSemana === dow)
      if (!h) return false
      return agendaMode === 'sobrecupo' ? h.sobrecupoActivo : h.activo
    })
  }, [doctors, horarios, currentDate, agendaMode])

  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden bg-slate-50 relative">
      {/* Overlay para cerrar el drawer en mobile */}
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          className="md:hidden fixed inset-0 bg-black/40 z-30"
        />
      )}
      {/* ── LEFT PANEL ── */}
      <div className={cn(
        'w-64 md:w-52 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col gap-5 p-4 overflow-y-auto shadow-sm',
        'fixed md:relative inset-y-0 left-0 z-40 md:z-auto transition-transform duration-200 ease-out',
        showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        {/* Header solo mobile: título + cerrar */}
        <div className="md:hidden flex items-center justify-between -mt-1 mb-1 pb-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Filtros</p>
          <button onClick={() => setShowSidebar(false)} className="p-1 text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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

        <div className={cn(
          'rounded-xl p-3 border',
          agendaMode === 'sobrecupo' ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200' : 'bg-gradient-to-br from-cyan-50 to-teal-50 border-cyan-100'
        )}>
          <p className={cn('text-xs font-semibold uppercase tracking-wider mb-1', agendaMode === 'sobrecupo' ? 'text-amber-600' : 'text-cyan-600')}>
            {agendaMode === 'sobrecupo' ? 'Sobrecupos hoy' : 'Citas hoy'}
          </p>
          <p className={cn('text-3xl font-bold', agendaMode === 'sobrecupo' ? 'text-amber-700' : 'text-cyan-700')}>
            {citas.filter(c => {
              if (agendaMode === 'sobrecupo' ? !c.sobrecupo : c.sobrecupo) return false
              const d = new Date(c.start); const t = new Date(); t.setHours(0,0,0,0)
              const te = new Date(t); te.setHours(23,59,59,999)
              return d >= t && d <= te
            }).length}
          </p>
        </div>
      </div>

      {/* ── CALENDAR ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — desktop */}
        <div className="hidden md:flex bg-white border-b border-slate-100 px-5 py-3 flex-col gap-3 flex-shrink-0">
          {/* Fila 1: tabs Sillón / Sobre Agendamiento */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setAgendaMode('base')}
                className={cn('flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-md transition-all',
                  agendaMode === 'base' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10m0 0a2 2 0 002 2h14a2 2 0 002-2V7M3 7l2-3h14l2 3M3 7h18M8 11h8" />
                </svg>
                Sillón
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                  agendaMode === 'base' ? 'bg-white/30 text-white' : 'bg-cyan-100 text-cyan-700')}>
                  {countBase}
                </span>
              </button>
              <button
                onClick={() => setAgendaMode('sobrecupo')}
                className={cn('flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-md transition-all',
                  agendaMode === 'sobrecupo' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                </svg>
                Sobre Agendamiento
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                  agendaMode === 'sobrecupo' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700')}>
                  {countSobre}
                </span>
              </button>
            </div>
            <div className="flex gap-2">
              {agendaMode === 'base' && (
                <button onClick={() => openBloqueoModal()}
                  className="flex items-center gap-2 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-semibold transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Bloquear horario
                </button>
              )}
              <button onClick={() => handleDateClick({ date: new Date() })}
                className={cn('flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm',
                  agendaMode === 'sobrecupo' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-cyan-600 hover:bg-cyan-700')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {agendaMode === 'sobrecupo' ? 'Nuevo sobrecupo' : 'Nueva cita'}
              </button>
            </div>
          </div>

          {/* Fila 2: navegación + selector de vista */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftCurrentDate(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={goToToday}
                className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
                Hoy
              </button>
              <button onClick={() => shiftCurrentDate(1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <p className="text-sm font-semibold text-slate-800 capitalize ml-2">{viewLabel}</p>
            </div>

            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => changeView('diaria')}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all',
                  view === 'diaria' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                Diaria
              </button>
              <button onClick={() => changeView('semanal')}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all',
                  view === 'semanal' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M3 8h4M3 16h4M11 4h10v16H11z" /></svg>
                Semanal
              </button>
              <button onClick={() => changeView('global')}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all',
                  view === 'global' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Diaria global
              </button>
            </div>
          </div>
        </div>

        {/* Header — mobile: filtros + navegación de día */}
        <div className="md:hidden bg-white border-b border-slate-100 px-3 py-2.5 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setShowSidebar(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filtros
              {(statusFilter.size < Object.keys(ESTADO_CONFIG).length || doctorFilter !== 'todos') && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              )}
            </button>
            <div className="flex gap-1.5">
              {agendaMode === 'base' && (
                <button onClick={() => openBloqueoModal()}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-700 border border-slate-200 bg-white px-2.5 py-1.5 rounded-lg">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Bloqueo
                </button>
              )}
              <button onClick={() => handleDateClick({ date: new Date() })}
                className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Nueva cita
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => shiftCurrentDate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-slate-900 capitalize">
                {currentDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <button
                onClick={goToToday}
                className="text-[11px] text-cyan-600 underline">
                Hoy
              </button>
            </div>
            <button onClick={() => shiftCurrentDate(1)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          {/* Tabs Sillón/Sobre Agendamiento — mobile */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setAgendaMode('base')}
              className={cn('flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-md transition-all',
                agendaMode === 'base' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600')}>
              Sillón
              <span className={cn('text-[9px] px-1 rounded-full font-bold',
                agendaMode === 'base' ? 'bg-white/30 text-white' : 'bg-cyan-100 text-cyan-700')}>{countBase}</span>
            </button>
            <button
              onClick={() => setAgendaMode('sobrecupo')}
              className={cn('flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-md transition-all',
                agendaMode === 'sobrecupo' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600')}>
              Sobre Agendamiento
              <span className={cn('text-[9px] px-1 rounded-full font-bold',
                agendaMode === 'sobrecupo' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700')}>{countSobre}</span>
            </button>
          </div>
        </div>

        {/* Vista lista — solo mobile */}
        <div className="md:hidden flex-1 overflow-y-auto bg-slate-50 p-3 space-y-2">
          {citasDelDia.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-slate-500">
                {agendaMode === 'sobrecupo' ? 'Sin sobrecupos para este día' : 'Sin citas para este día'}
              </p>
              <button onClick={() => handleDateClick({ date: new Date(currentDate.getTime() + 9 * 3600 * 1000) })}
                className="mt-3 text-xs text-cyan-600 underline">
                + Agendar
              </button>
            </div>
          ) : (
            citasDelDia.map(c => {
              const cfg = ESTADO_CONFIG[c.estado] ?? { label: c.estado, color: '#64748b', bg: '#f1f5f9', text: '#334155' }
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCita(c); setShowHistorial(false) }}
                  className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-stretch">
                    <div className="w-1.5 rounded-l-2xl flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                    <div className="flex-1 p-3.5 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-semibold text-slate-500">
                            {formatTime(c.start)} – {formatTime(c.end)}
                          </p>
                          <p className="font-semibold text-slate-900 truncate">
                            {c.confirmadoWA && <span className="text-emerald-500 mr-1">✓</span>}
                            {c.pacienteNombre}
                          </p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0"
                          style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 space-y-0.5">
                        <p className="truncate">
                          <span className="text-slate-400">Dr.</span> {c.doctor ?? '—'}
                        </p>
                        {c.tipo && c.tipo !== 'CONSULTA' && (
                          <p className="truncate"><span className="text-slate-400">Motivo:</span> {c.tipo}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Vistas desktop — condicional según view */}
        <div className="hidden md:block flex-1 overflow-auto bg-white">
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

          {/* ── Vista SEMANAL: FullCalendar ────────────────────────────────── */}
          {view === 'semanal' && (
            <FullCalendar
              ref={calRef}
              plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              initialDate={currentDate}
              locale={esLocale}
              headerToolbar={false}
              events={events}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              datesSet={(arg) => {
                // Mantener currentDate sincronizado con el calendario
                const start = arg.view.currentStart
                if (start.getTime() !== currentDate.getTime()) {
                  // Solo sincronizar si la fecha del calendario está fuera de la semana actual
                  const ws = new Date(currentDate); ws.setDate(ws.getDate() - ws.getDay()); ws.setHours(0,0,0,0)
                  if (start < ws || start > new Date(ws.getTime() + 6 * 86400000)) {
                    const d = new Date(start); d.setHours(0,0,0,0)
                    setCurrentDate(d)
                  }
                }
              }}
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
          )}

          {/* ── Vista DIARIA: lista del día con columnas Hora/Paciente/Doctor/Estado ── */}
          {view === 'diaria' && (
            <ListaDiaria
              citas={citasDelDia}
              bloqueos={bloqueosDelDia}
              onCitaClick={(c) => { setSelectedCita(c); setShowHistorial(false) }}
              onBloqueoClick={(b) => setSelectedBloqueo(b)}
              estadoConfig={ESTADO_CONFIG}
              onUpdateEstado={updateEstado}
              date={currentDate}
            />
          )}

          {/* ── Vista DIARIA GLOBAL: grilla con columnas por doctor ────────── */}
          {view === 'global' && (
            <DiariaGlobal
              doctors={doctorsForGlobal}
              horarios={horarios}
              citas={citasDelDia}
              bloqueos={bloqueosDelDia}
              date={currentDate}
              agendaMode={agendaMode}
              estadoConfig={ESTADO_CONFIG}
              onSlotClick={(date, doctorId) => handleDateClick({ date, doctorId })}
              onCitaClick={(c) => { setSelectedCita(c); setShowHistorial(false) }}
              onBloqueoClick={(b) => setSelectedBloqueo(b)}
            />
          )}
        </div>
      </div>

      {/* ── MODAL: Dar cita — PASO 1 ── */}
      {darCita?.step === 1 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className={cn('px-6 py-5 border-b border-slate-100 flex justify-between items-center',
              darCita.sobrecupo && 'bg-amber-50')}>
              <h2 className="text-base font-semibold text-slate-900">
                {darCita.sobrecupo ? 'Dar sobrecupo' : 'Dar cita'}
              </h2>
              <button onClick={() => setDarCita(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Tipo de agenda: base / sobrecupo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de agenda</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => setDarCita(d => d ? { ...d, sobrecupo: false } : d)}
                    className={cn('flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                      !darCita.sobrecupo ? 'bg-cyan-50 border-cyan-500 text-cyan-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    Cita base
                  </button>
                  <button type="button"
                    onClick={() => setDarCita(d => d ? { ...d, sobrecupo: true } : d)}
                    className={cn('flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                      darCita.sobrecupo ? 'bg-amber-50 border-amber-500 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    Sobrecupo
                  </button>
                </div>
              </div>

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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col md:flex-row overflow-hidden" style={{ maxHeight: '95vh' }}>
            {/* Left: radio tabs */}
            <div className="md:w-52 flex-shrink-0 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-3 md:p-5 flex md:flex-col gap-2 md:gap-3">
              <p className="hidden md:block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo de paciente</p>
              {(['existente', 'nuevo'] as const).map(mode => (
                <label key={mode}
                  className={cn('flex-1 md:flex-initial flex items-center gap-2.5 p-2.5 md:p-3 rounded-xl border-2 cursor-pointer transition-all',
                    darCita.mode === mode ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
                  <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    darCita.mode === mode ? 'border-cyan-500' : 'border-slate-300')}>
                    {darCita.mode === mode && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
                  </div>
                  <input type="radio" className="sr-only" checked={darCita.mode === mode}
                    onChange={() => setDarCita(d => d ? { ...d, mode, pacienteId: '', search: '' } : d)} />
                  <span className="text-sm font-medium text-slate-700">
                    <span className="md:hidden">{mode === 'existente' ? 'Existente' : 'Nuevo'}</span>
                    <span className="hidden md:inline">{mode === 'existente' ? 'Paciente existente' : 'Paciente nuevo'}</span>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start flex-shrink-0">
              <div>
                <Link
                  href={`/pacientes/${selectedCita.pacienteId}`}
                  className="text-lg font-semibold text-slate-900 hover:text-cyan-700 hover:underline">
                  {selectedCita.pacienteNombre}
                </Link>
                <p className="text-sm text-slate-500 mt-0.5">{formatTime(selectedCita.start)} — {formatTime(selectedCita.end)}</p>
              </div>
              <button onClick={() => setSelectedCita(null)} className="text-slate-400 hover:text-slate-600 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* CTAs: ficha del paciente + editar/reagendar */}
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/pacientes/${selectedCita.pacienteId}`}
                  className="flex items-center justify-center gap-2 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-700 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Ver ficha
                </Link>
                <button
                  onClick={() => openEditCita(selectedCita)}
                  className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Editar / Reagendar
                </button>
              </div>
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
                {/* Acción principal del flujo de recepción, destacada */}
                {(() => {
                  const next = siguienteEstado(selectedCita.estado)
                  if (!next) return null
                  const cfg = ESTADO_CONFIG[next.estado]
                  return (
                    <button
                      onClick={() => updateEstado(selectedCita.id, next.estado)}
                      disabled={updating}
                      className="w-full mb-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: cfg.color }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      {next.accion} ({cfg.label})
                    </button>
                  )
                })()}
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

              {/* Sobrecupo badge */}
              {selectedCita.sobrecupo && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                  </svg>
                  <span className="text-sm font-medium text-amber-700">Cita de Sobre Agendamiento</span>
                </div>
              )}

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

      {/* ── MODAL: Editar / Reagendar cita ── */}
      {editCita && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Editar cita</h2>
                <p className="text-xs text-slate-500 mt-0.5">{editCita.pacienteNombre}</p>
              </div>
              <button onClick={() => setEditCita(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEditCita} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha *</label>
                  <input type="date" required value={editCita.fecha}
                    onChange={e => setEditCita(s => s ? { ...s, fecha: e.target.value } : s)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hora *</label>
                  <input type="time" required value={editCita.hora}
                    onChange={e => setEditCita(s => s ? { ...s, hora: e.target.value } : s)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Duración</label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_DURACIONES.map(d => (
                    <button key={d} type="button"
                      onClick={() => setEditCita(s => s ? { ...s, duracion: d } : s)}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all',
                        editCita.duracion === d
                          ? 'bg-cyan-600 border-cyan-600 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-cyan-300')}>
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Profesional</label>
                <select value={editCita.doctorId}
                  onChange={e => setEditCita(s => s ? { ...s, doctorId: e.target.value } : s)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo</label>
                <select value={editCita.tipo}
                  onChange={e => setEditCita(s => s ? { ...s, tipo: e.target.value } : s)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Consulta</option>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                <input type="text" value={editCita.notas} placeholder="Comentario opcional…"
                  onChange={e => setEditCita(s => s ? { ...s, notas: e.target.value } : s)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              {editError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{editError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditCita(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingEdit}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                  {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: crear bloqueo de agenda */}
      {bloqueoForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bloquear horario</h2>
                <p className="text-xs text-slate-500 mt-0.5">El doctor queda no disponible en ese rango y no se podrán agendar citas.</p>
              </div>
              <button onClick={() => setBloqueoForm(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveBloqueo} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor *</label>
                {isAdmin ? (
                  <select required value={bloqueoForm.doctorId}
                    onChange={(e) => setBloqueoForm({ ...bloqueoForm, doctorId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500">
                    <option value="">Seleccionar doctor</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name ?? d.email}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" disabled value={doctors.find(d => d.id === currentUserId)?.name ?? doctors.find(d => d.id === currentUserId)?.email ?? 'Tú'}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-600" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Desde *</label>
                  <input type="datetime-local" required value={bloqueoForm.inicio}
                    onChange={(e) => setBloqueoForm({ ...bloqueoForm, inicio: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hasta *</label>
                  <input type="datetime-local" required value={bloqueoForm.fin}
                    onChange={(e) => setBloqueoForm({ ...bloqueoForm, fin: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo (opcional)</label>
                <input type="text" value={bloqueoForm.motivo}
                  onChange={(e) => setBloqueoForm({ ...bloqueoForm, motivo: e.target.value })}
                  placeholder="Vacaciones, capacitación, congreso…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
              </div>
              {bloqueoError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{bloqueoError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setBloqueoForm(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingBloqueo || !bloqueoForm.doctorId}
                  className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl text-sm font-medium">
                  {savingBloqueo ? 'Bloqueando…' : 'Bloquear horario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: ver / eliminar bloqueo */}
      {selectedBloqueo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bloqueo de agenda</h2>
                <p className="text-xs text-slate-500 mt-0.5">{selectedBloqueo.doctor}</p>
              </div>
              <button onClick={() => setSelectedBloqueo(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-slate-500">Desde</span><span className="font-mono text-slate-800">{new Date(selectedBloqueo.inicio).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Hasta</span><span className="font-mono text-slate-800">{new Date(selectedBloqueo.fin).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
              </div>
              {selectedBloqueo.motivo && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Motivo</p>
                  <p className="text-sm text-slate-700">{selectedBloqueo.motivo}</p>
                </div>
              )}
              {selectedBloqueo.createdByName && (
                <p className="text-[11px] text-slate-400">Creado por {selectedBloqueo.createdByName}</p>
              )}
              {selectedBloqueo.googleEventId && (
                <p className="text-[11px] text-blue-600">Sincronizado con Google Calendar.</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSelectedBloqueo(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cerrar
                </button>
                {(isAdmin || selectedBloqueo.doctorId === currentUserId) && (
                  <button type="button" onClick={() => deleteBloqueo(selectedBloqueo.id)}
                    className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium">
                    Eliminar bloqueo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Vista DIARIA: lista compacta con hora · paciente · doctor · estado
// ────────────────────────────────────────────────────────────────────────────
function ListaDiaria({
  citas, bloqueos, onCitaClick, onBloqueoClick, estadoConfig, onUpdateEstado, date,
}: {
  citas: Cita[]
  bloqueos: Bloqueo[]
  onCitaClick: (c: Cita) => void
  onBloqueoClick: (b: Bloqueo) => void
  estadoConfig: typeof ESTADO_CONFIG
  onUpdateEstado: (citaId: string, estado: string) => void
  date: Date
}) {
  // Merge ordenado por hora de citas + bloqueos.
  type Row =
    | { kind: 'cita'; data: Cita; ts: number }
    | { kind: 'bloqueo'; data: Bloqueo; ts: number }
  const rows: Row[] = [
    ...citas.map((c) => ({ kind: 'cita' as const, data: c, ts: new Date(c.start).getTime() })),
    ...bloqueos.map((b) => ({ kind: 'bloqueo' as const, data: b, ts: new Date(b.inicio).getTime() })),
  ].sort((a, b) => a.ts - b.ts)

  if (rows.length === 0) {
    return (
      <div className="p-12 text-center">
        <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-slate-500">
          Sin citas para {date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
    )
  }

  return (
    <div className="px-5 py-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_220px_140px_120px] gap-4 px-5 py-3 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <div>Hora</div>
          <div>Paciente / Motivo</div>
          <div>Doctor</div>
          <div>Estado</div>
          <div>Acciones</div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            if (row.kind === 'bloqueo') {
              const b = row.data
              return (
                <div key={`b-${b.id}`} className="grid grid-cols-[100px_1fr_220px_140px_120px] gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors items-center bg-slate-50/60">
                  <div className="flex flex-col">
                    <span className="font-mono text-sm font-semibold text-slate-600">{formatTime(b.inicio)}</span>
                    <span className="font-mono text-[11px] text-slate-400">{formatTime(b.fin)}</span>
                  </div>
                  <button onClick={() => onBloqueoClick(b)} className="text-left min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      {b.motivo ?? 'Bloqueo'}
                    </p>
                    {b.googleEventId && (
                      <p className="text-[11px] text-blue-500 mt-0.5">Importado de Google Calendar</p>
                    )}
                  </button>
                  <div className="text-sm text-slate-700 truncate">{b.doctor ?? '—'}</div>
                  <div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap bg-slate-200 text-slate-700">
                      Bloqueo
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onBloqueoClick(b)}
                      className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">
                      Detalle
                    </button>
                  </div>
                </div>
              )
            }
            const c = row.data
            const cfg = estadoConfig[c.estado] ?? { label: c.estado, color: '#64748b', bg: '#f1f5f9', text: '#334155' }
            return (
              <div key={`c-${c.id}`} className="grid grid-cols-[100px_1fr_220px_140px_120px] gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors items-center">
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-semibold text-slate-900">{formatTime(c.start)}</span>
                  <span className="font-mono text-[11px] text-slate-400">{formatTime(c.end)}</span>
                </div>
                <button onClick={() => onCitaClick(c)} className="text-left min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1">
                    {c.sobrecupo && (
                      <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Sobrecupo">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                      </svg>
                    )}
                    {c.confirmadoWA && (
                      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Confirmada por WhatsApp">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className="truncate">{c.pacienteNombre}</span>
                  </p>
                  {(c.pacienteRut || c.pacienteTelefono) && (
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                      {c.pacienteRut ?? ''}{c.pacienteRut && c.pacienteTelefono ? ' · ' : ''}{c.pacienteTelefono ?? ''}
                    </p>
                  )}
                </button>
                <div className="text-sm text-slate-700 truncate">{c.doctor ?? '—'}</div>
                <div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap"
                    style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onCitaClick(c)}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">
                    Detalle
                  </button>
                  {(() => {
                    const next = siguienteEstado(c.estado)
                    if (!next) return null
                    const nextCfg = estadoConfig[next.estado]
                    return (
                      <button onClick={() => onUpdateEstado(c.id, next.estado)}
                        title={`Pasar a ${nextCfg?.label ?? next.estado}`}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap"
                        style={{ color: nextCfg?.text, backgroundColor: nextCfg?.bg, borderColor: nextCfg?.color }}>
                        {next.accion}
                      </button>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Vista DIARIA GLOBAL: una columna por doctor, slots de 15 min sobre el día
// ────────────────────────────────────────────────────────────────────────────
function DiariaGlobal({
  doctors, horarios, citas, bloqueos, date, agendaMode, estadoConfig, onSlotClick, onCitaClick, onBloqueoClick,
}: {
  doctors: { id: string; name: string | null; email: string | null }[]
  horarios: Horario[]
  citas: Cita[]
  bloqueos: Bloqueo[]
  date: Date
  agendaMode: AgendaMode
  estadoConfig: typeof ESTADO_CONFIG
  onSlotClick: (date: Date, doctorId: string) => void
  onCitaClick: (c: Cita) => void
  onBloqueoClick: (b: Bloqueo) => void
}) {
  const dow = date.getDay()
  // Min/max global del día (considerando todos los doctores que atienden)
  const { minMin, maxMin } = useMemo(() => {
    let lo = 24 * 60, hi = 0
    for (const d of doctors) {
      const h = horarios.find(h => h.doctorId === d.id && h.diaSemana === dow)
      if (!h) continue
      const ini = agendaMode === 'sobrecupo' ? (h.sobrecupoInicio ?? h.horaInicio) : h.horaInicio
      const fin = agendaMode === 'sobrecupo' ? (h.sobrecupoFin    ?? h.horaFin)    : h.horaFin
      const a = toMinutes(ini), b = toMinutes(fin)
      if (a < lo) lo = a
      if (b > hi) hi = b
    }
    if (hi <= lo) { lo = 9 * 60; hi = 18 * 60 }
    // Redondear a la hora
    lo = Math.floor(lo / 60) * 60
    hi = Math.ceil(hi / 60) * 60
    return { minMin: lo, maxMin: hi }
  }, [doctors, horarios, dow, agendaMode])

  if (doctors.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-slate-500">
          Ningún profesional tiene {agendaMode === 'sobrecupo' ? 'sobrecupos' : 'horario'} habilitado este día.
        </p>
      </div>
    )
  }

  const SLOT_MIN = 15
  const SLOT_PX = 22
  const slots: number[] = []
  for (let m = minMin; m < maxMin; m += SLOT_MIN) slots.push(m)

  function toHHMM(min: number) {
    const h = Math.floor(min / 60).toString().padStart(2, '0')
    const m = (min % 60).toString().padStart(2, '0')
    return `${h}:${m}`
  }

  function isWorking(doctorId: string, slotMin: number) {
    const h = horarios.find(h => h.doctorId === doctorId && h.diaSemana === dow)
    if (!h) return false
    if (agendaMode === 'sobrecupo' ? !h.sobrecupoActivo : !h.activo) return false
    const a = toMinutes(agendaMode === 'sobrecupo' ? (h.sobrecupoInicio ?? h.horaInicio) : h.horaInicio)
    const b = toMinutes(agendaMode === 'sobrecupo' ? (h.sobrecupoFin    ?? h.horaFin)    : h.horaFin)
    if (!(slotMin >= a && slotMin < b)) return false
    // Receso solo aplica a la agenda base
    if (agendaMode === 'base' && h.recesoActivo && h.recesoInicio && h.recesoFin) {
      const ri = toMinutes(h.recesoInicio), rf = toMinutes(h.recesoFin)
      if (slotMin >= ri && slotMin < rf) return false
    }
    return true
  }

  function citasOf(doctorId: string) {
    return citas.filter(c => c.doctorId === doctorId)
  }

  function bloqueosOf(doctorId: string) {
    return bloqueos.filter(b => b.doctorId === doctorId)
  }

  function buildSlotDate(slotMin: number) {
    const d = new Date(date)
    d.setHours(Math.floor(slotMin / 60), slotMin % 60, 0, 0)
    return d
  }

  return (
    <div className="overflow-auto h-full">
      <div className="inline-flex min-w-full">
        {/* Columna de horas */}
        <div className="flex-shrink-0 w-16 border-r border-slate-200 bg-slate-50 sticky left-0 z-10">
          <div className="h-12 border-b border-slate-200 bg-white" />
          {slots.map((m) => (
            <div key={m} style={{ height: SLOT_PX }} className="flex items-start justify-end pr-2 pt-0.5 text-[10px] font-medium text-slate-400 border-b border-slate-100 font-mono">
              {m % 60 === 0 ? toHHMM(m) : ''}
            </div>
          ))}
        </div>
        {/* Una columna por doctor */}
        {doctors.map((doc) => {
          const dCitas = citasOf(doc.id)
          const dBloqueos = bloqueosOf(doc.id)
          return (
            <div key={doc.id} className="flex-shrink-0 w-44 border-r border-slate-200 relative">
              <div className="h-12 border-b border-slate-200 bg-slate-50 px-3 flex items-center sticky top-0 z-10">
                <p className="text-xs font-bold text-slate-700 truncate uppercase tracking-wide">{doc.name ?? doc.email}</p>
              </div>
              <div className="relative">
                {/* slots */}
                {slots.map((m) => {
                  const working = isWorking(doc.id, m)
                  return (
                    <div
                      key={m}
                      style={{ height: SLOT_PX }}
                      onClick={working ? () => onSlotClick(buildSlotDate(m), doc.id) : undefined}
                      className={cn(
                        'border-b border-slate-100 transition-colors',
                        working ? 'bg-emerald-50/40 hover:bg-emerald-100/60 cursor-pointer' : 'bg-slate-100/40 cursor-not-allowed',
                        m % 60 === 0 && 'border-t border-slate-200/70',
                      )}
                    />
                  )
                })}
                {/* bloqueos (van debajo de las citas en z-order) */}
                {dBloqueos.map((b) => {
                  const start = new Date(b.inicio)
                  const end = new Date(b.fin)
                  const startMin = start.getHours() * 60 + start.getMinutes()
                  const endMin = end.getHours() * 60 + end.getMinutes()
                  if (endMin <= minMin || startMin >= maxMin) return null
                  const top = ((Math.max(startMin, minMin) - minMin) / SLOT_MIN) * SLOT_PX
                  const height = ((Math.min(endMin, maxMin) - Math.max(startMin, minMin)) / SLOT_MIN) * SLOT_PX
                  return (
                    <button
                      key={`b-${b.id}`}
                      onClick={() => onBloqueoClick(b)}
                      className="absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-left overflow-hidden shadow-sm border border-slate-600/40 hover:opacity-90 transition-opacity"
                      style={{ top, height: Math.max(height, 18), backgroundColor: '#475569' }}
                    >
                      <div className="text-[10px] font-bold text-slate-50 truncate leading-tight">
                        {b.motivo ?? 'Bloqueo'}
                      </div>
                      {height >= 36 && (
                        <div className="text-[9px] text-slate-300 truncate font-mono leading-tight">
                          {formatTime(b.inicio)}
                        </div>
                      )}
                    </button>
                  )
                })}
                {/* citas */}
                {dCitas.map((c) => {
                  const start = new Date(c.start)
                  const end = new Date(c.end)
                  const startMin = start.getHours() * 60 + start.getMinutes()
                  const endMin = end.getHours() * 60 + end.getMinutes()
                  if (endMin <= minMin || startMin >= maxMin) return null
                  const top = ((Math.max(startMin, minMin) - minMin) / SLOT_MIN) * SLOT_PX
                  const height = ((Math.min(endMin, maxMin) - Math.max(startMin, minMin)) / SLOT_MIN) * SLOT_PX
                  const cfg = estadoConfig[c.estado] ?? { color: '#64748b', bg: '#f1f5f9', text: '#334155', label: c.estado }
                  return (
                    <button
                      key={c.id}
                      onClick={() => onCitaClick(c)}
                      className="absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-left overflow-hidden shadow-sm border border-white/20 hover:opacity-90 transition-opacity"
                      style={{ top, height: Math.max(height, 18), backgroundColor: cfg.color }}
                    >
                      <div className="text-[10px] font-bold text-white truncate leading-tight">
                        {c.confirmadoWA && '✓ '}{c.pacienteNombre}
                      </div>
                      {height >= 36 && (
                        <div className="text-[9px] text-white/80 truncate font-mono leading-tight">
                          {formatTime(c.start)}
                        </div>
                      )}
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
