// Estados de cita — fuente única de verdad compartida (frontend + backend).
// Idéntico en semántica al lib/cita-estados.ts del monolito; acá vive el
// canonical para la arquitectura separada.

export interface EstadoCitaConfig {
  label: string
  color: string
  bg: string
  text: string
  badgeClass: string
  orden: number
}

export const CITA_ESTADOS: Record<string, EstadoCitaConfig> = {
  PENDIENTE:   { label: 'Agendada',    color: '#f59e0b', bg: '#fef3c7', text: '#92400e', badgeClass: 'bg-amber-100 text-amber-700',   orden: 1 },
  CONFIRMADA:  { label: 'Confirmada',  color: '#0891b2', bg: '#cffafe', text: '#155e75', badgeClass: 'bg-cyan-100 text-cyan-700',     orden: 2 },
  EN_ESPERA:   { label: 'En espera',   color: '#8b5cf6', bg: '#ede9fe', text: '#5b21b6', badgeClass: 'bg-violet-100 text-violet-700', orden: 3 },
  EN_ATENCION: { label: 'En atención', color: '#3b82f6', bg: '#dbeafe', text: '#1e40af', badgeClass: 'bg-blue-100 text-blue-700',     orden: 4 },
  ATENDIDA:    { label: 'Atendida',    color: '#10b981', bg: '#d1fae5', text: '#065f46', badgeClass: 'bg-emerald-100 text-emerald-700', orden: 5 },
  NO_ASISTIO:  { label: 'No asistió',  color: '#6b7280', bg: '#f3f4f6', text: '#374151', badgeClass: 'bg-slate-100 text-slate-600',   orden: 6 },
  CANCELADA:   { label: 'Cancelada',   color: '#ef4444', bg: '#fee2e2', text: '#991b1b', badgeClass: 'bg-rose-100 text-rose-700',     orden: 7 },
}

export const CITA_ESTADOS_KEYS = Object.keys(CITA_ESTADOS)
export const CITA_ESTADO_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CITA_ESTADOS).map(([k, v]) => [k, v.label]),
)
export const ESTADOS_NO_OCUPAN = ['CANCELADA', 'NO_ASISTIO']

export function siguienteEstado(estado: string): { estado: string; accion: string } | null {
  switch (estado) {
    case 'PENDIENTE':   return { estado: 'CONFIRMADA',  accion: 'Confirmar' }
    case 'CONFIRMADA':  return { estado: 'EN_ESPERA',   accion: 'Llegó' }
    case 'EN_ESPERA':   return { estado: 'EN_ATENCION', accion: 'Pasar al sillón' }
    case 'EN_ATENCION': return { estado: 'ATENDIDA',    accion: 'Finalizar' }
    default:            return null
  }
}

export function estadoConfig(estado: string): EstadoCitaConfig {
  return CITA_ESTADOS[estado] ?? {
    label: estado, color: '#64748b', bg: '#f1f5f9', text: '#334155',
    badgeClass: 'bg-slate-100 text-slate-600', orden: 99,
  }
}
