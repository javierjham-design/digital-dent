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

// Paleta alineada a la simbología tipo Dentalink: agendada (tan/no confirmado),
// confirmada (verde), en espera (amarillo), en atención (teal), atendida (gris),
// no asistió (lavanda), cancelada/anulado (gris apagado).
export const CITA_ESTADOS: Record<string, EstadoCitaConfig> = {
  PENDIENTE:   { label: 'Agendada',    color: '#e8923a', bg: '#fdebd0', text: '#9a5b1e', badgeClass: 'bg-amber-100 text-amber-700',     orden: 1 },
  CONFIRMADA:  { label: 'Confirmada',  color: '#2bb673', bg: '#d4f3e3', text: '#0f5132', badgeClass: 'bg-emerald-100 text-emerald-700', orden: 2 },
  EN_ESPERA:   { label: 'En espera',   color: '#eab308', bg: '#fef9c3', text: '#854d0e', badgeClass: 'bg-yellow-100 text-yellow-700',   orden: 3 },
  EN_ATENCION: { label: 'En atención', color: '#14b8a6', bg: '#ccfbf1', text: '#115e59', badgeClass: 'bg-teal-100 text-teal-700',       orden: 4 },
  ATENDIDA:    { label: 'Atendida',    color: '#94a3b8', bg: '#e2e8f0', text: '#334155', badgeClass: 'bg-slate-100 text-slate-600',     orden: 5 },
  NO_ASISTIO:  { label: 'No asistió',  color: '#a78bfa', bg: '#ede9fe', text: '#5b21b6', badgeClass: 'bg-violet-100 text-violet-700',   orden: 6 },
  CANCELADA:   { label: 'Cancelada',   color: '#cbd5e1', bg: '#f1f5f9', text: '#64748b', badgeClass: 'bg-slate-100 text-slate-500',     orden: 7 },
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
