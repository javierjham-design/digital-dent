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
  PENDIENTE:   { label: 'Agendada',                 color: '#e8923a', bg: '#fdebd0', text: '#9a5b1e', badgeClass: 'bg-amber-100 text-amber-700',     orden: 1 },
  // Verde = se envió/notificó el WhatsApp al paciente (aún no confirma).
  CONFIRMADA:  { label: 'Notificado por WhatsApp',  color: '#2bb673', bg: '#d4f3e3', text: '#0f5132', badgeClass: 'bg-emerald-100 text-emerald-700', orden: 2 },
  // Azul claro = el paciente confirmó su asistencia.
  CONFIRMADO:  { label: 'Confirmado',               color: '#0ea5e9', bg: '#e0f2fe', text: '#075985', badgeClass: 'bg-sky-100 text-sky-700',         orden: 3 },
  EN_ESPERA:   { label: 'En espera',                color: '#eab308', bg: '#fef9c3', text: '#854d0e', badgeClass: 'bg-yellow-100 text-yellow-700',   orden: 4 },
  EN_ATENCION: { label: 'En atención',              color: '#14b8a6', bg: '#ccfbf1', text: '#115e59', badgeClass: 'bg-teal-100 text-teal-700',       orden: 5 },
  ATENDIDA:    { label: 'Atendida',                 color: '#94a3b8', bg: '#e2e8f0', text: '#334155', badgeClass: 'bg-slate-100 text-slate-600',     orden: 6 },
  NO_ASISTIO:  { label: 'No asistió',               color: '#a78bfa', bg: '#ede9fe', text: '#5b21b6', badgeClass: 'bg-violet-100 text-violet-700',   orden: 7 },
  CANCELADA:   { label: 'Cancelada',                color: '#cbd5e1', bg: '#f1f5f9', text: '#64748b', badgeClass: 'bg-slate-100 text-slate-500',     orden: 8 },
}

// Motivos de cancelación que puede informar un canal externo (TuBot/WhatsApp) en el body del
// cancel y que Cláriva persiste en `Cita.motivoCancelacion`. 'patient_reschedule' (el paciente
// quiere mover la hora) alimenta la lista "Pacientes pendientes de reagendar"; 'patient_cancel'
// es una cancelación sin intención de reagendar. Una cancelación manual en el panel no lleva motivo.
export const MOTIVO_CANCELACION = {
  REAGENDAR: 'patient_reschedule',
  CANCELAR: 'patient_cancel',
} as const
export type MotivoCancelacion = (typeof MOTIVO_CANCELACION)[keyof typeof MOTIVO_CANCELACION]
export const MOTIVOS_CANCELACION_VALIDOS: string[] = Object.values(MOTIVO_CANCELACION)
// Texto para el historial de la cita cuando la cancelación trae motivo.
export const MOTIVO_CANCELACION_LABEL: Record<string, string> = {
  [MOTIVO_CANCELACION.REAGENDAR]: 'el paciente pidió reagendar',
  [MOTIVO_CANCELACION.CANCELAR]: 'cancelada por el paciente',
}

// Lista "Pendientes de reagendar": por qué un paciente está en ella.
//  - REAGENDAR: su cita se canceló con motivo 'patient_reschedule' (pidió mover la hora).
//  - NO_SHOW:  no asistió a su última cita (NO_ASISTIO) y no volvió a agendar.
export const REAGENDA_ORIGEN = {
  REAGENDAR: 'patient_reschedule',
  NO_SHOW: 'no_show',
} as const
export type ReagendaOrigen = (typeof REAGENDA_ORIGEN)[keyof typeof REAGENDA_ORIGEN]
export const REAGENDA_ORIGEN_LABEL: Record<string, string> = {
  [REAGENDA_ORIGEN.REAGENDAR]: 'Pidió reagendar',
  [REAGENDA_ORIGEN.NO_SHOW]: 'No asistió',
}

// Resolución MANUAL de un pendiente de reagendar (recepción lo saca de la lista y el paciente
// vuelve a aparecer SOLO en el listado total):
//  - AGENDADO:    se le dio hora (por teléfono/mostrador) o ya no corresponde seguirlo.
//  - NO_REAGENDA: el paciente no quiere / no va a reagendar (lo dijo explícitamente).
//  - PERDIDO:     no se logró recuperar al paciente (no contesta, se dio por perdido).
// Si el paciente vuelve a no-asistir/cancelar DESPUÉS de resolverlo, reaparece solo.
export const REAGENDA_RESOLUCION = {
  AGENDADO: 'AGENDADO',
  NO_REAGENDA: 'NO_REAGENDA',
  PERDIDO: 'PERDIDO',
} as const
export type ReagendaResolucionEstado = (typeof REAGENDA_RESOLUCION)[keyof typeof REAGENDA_RESOLUCION]
export const REAGENDA_RESOLUCIONES_VALIDAS: string[] = Object.values(REAGENDA_RESOLUCION)
export const REAGENDA_RESOLUCION_LABEL: Record<string, string> = {
  [REAGENDA_RESOLUCION.AGENDADO]: 'Agendado',
  [REAGENDA_RESOLUCION.NO_REAGENDA]: 'No reagenda',
  [REAGENDA_RESOLUCION.PERDIDO]: 'Perdido',
}
// Badge por estado de resolución (vista "resueltos"): verde=agendado, gris=no reagenda, rojo=perdido.
export const REAGENDA_RESOLUCION_BADGE: Record<string, string> = {
  [REAGENDA_RESOLUCION.AGENDADO]: 'bg-emerald-100 text-emerald-700',
  [REAGENDA_RESOLUCION.NO_REAGENDA]: 'bg-slate-100 text-slate-600',
  [REAGENDA_RESOLUCION.PERDIDO]: 'bg-rose-100 text-rose-700',
}

// Umbral de la alerta: un pendiente que lleva más de estos días sin reagendar se marca
// en rojo ("lleva más de un mes") para que recepción lo priorice o lo clasifique.
export const REAGENDA_ALERTA_DIAS = 30

export const CITA_ESTADOS_KEYS = Object.keys(CITA_ESTADOS)
export const CITA_ESTADO_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CITA_ESTADOS).map(([k, v]) => [k, v.label]),
)
export const ESTADOS_NO_OCUPAN = ['CANCELADA', 'NO_ASISTIO']

export function siguienteEstado(estado: string): { estado: string; accion: string } | null {
  switch (estado) {
    case 'PENDIENTE':   return { estado: 'CONFIRMADA',  accion: 'Notificar WhatsApp' }
    case 'CONFIRMADA':  return { estado: 'CONFIRMADO',  accion: 'Confirmar' }
    case 'CONFIRMADO':  return { estado: 'EN_ESPERA',   accion: 'Llegó' }
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
