// Gestor de IA (clínica): configura TODA la automatización conversacional con los pacientes
// vía TuBot. Cláriva EMITE los eventos y gobierna qué flujo está encendido + los tiempos de
// detección; el ENVÍO de WhatsApp y la conversación los hace TuBot. La CONEXIÓN con TuBot
// (credenciales/token) la deja el super-admin; acá la clínica solo enciende/apaga y ajusta.
import type { TenantClient } from '@/db/tenant'
import { badRequest } from '@/lib/errors'

const SELECT = {
  agendaWhEnabled: true, agendaWhConnectionId: true,
  automatizacionesEnabled: true, recordatoriosEnabled: true,
  recapturaNoShowEnabled: true, recapturaTratEnabled: true,
  noShowAutoHoras: true, recapturaDiasPerdido: true, recapturaTratDias: true,
} as const

export async function getAutomatizaciones(db: TenantClient) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: SELECT })
  const tubotConectado = Boolean(c?.agendaWhEnabled && c?.agendaWhConnectionId)
  return {
    tubotConectado,
    maestroActivo: Boolean(c?.automatizacionesEnabled),
    confirmaciones: { activo: c?.recordatoriosEnabled ?? true },
    noShow: { activo: Boolean(c?.recapturaNoShowEnabled), horasAuto: c?.noShowAutoHoras ?? 3, diasPerdido: c?.recapturaDiasPerdido ?? 5 },
    tratamiento: { activo: Boolean(c?.recapturaTratEnabled), diasEspera: c?.recapturaTratDias ?? 3 },
  }
}

const entero = (v: unknown, min: number, max: number, campo: string): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${campo} debe ser un entero entre ${min} y ${max}`)
  return n
}

export async function putAutomatizaciones(db: TenantClient, body: Record<string, unknown>) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { agendaWhEnabled: true, agendaWhConnectionId: true } })
  if (!c) throw badRequest('Configuración no encontrada')
  const data: Record<string, unknown> = {}

  // Maestro: no se puede encender si TuBot no está conectado (lo configura el equipo de Cláriva).
  if (body.maestroActivo != null) {
    const on = Boolean(body.maestroActivo)
    if (on && !(c.agendaWhEnabled && c.agendaWhConnectionId)) {
      throw badRequest('Primero el equipo de Cláriva debe conectar TuBot para tu clínica.')
    }
    data.automatizacionesEnabled = on
  }
  // Flujos (toggles).
  if (body.confirmacionesActivo != null) data.recordatoriosEnabled = Boolean(body.confirmacionesActivo)
  if (body.noShowActivo != null) data.recapturaNoShowEnabled = Boolean(body.noShowActivo)
  if (body.tratamientoActivo != null) data.recapturaTratEnabled = Boolean(body.tratamientoActivo)
  // Tiempos de detección.
  if (body.noShowHorasAuto != null && String(body.noShowHorasAuto) !== '') {
    data.noShowAutoHoras = entero(body.noShowHorasAuto, 1, 72, 'Las horas para marcar no-show automático')
  }
  if (body.perdidoDias != null && String(body.perdidoDias) !== '') {
    data.recapturaDiasPerdido = entero(body.perdidoDias, 1, 60, 'Los días para marcar PERDIDO')
  }
  if (body.tratamientoDiasEspera != null && String(body.tratamientoDiasEspera) !== '') {
    data.recapturaTratDias = entero(body.tratamientoDiasEspera, 1, 60, 'Los días de espera para avisar de un tratamiento pendiente')
  }

  await db.configuracion.update({ where: { id: 'singleton' }, data })
  return getAutomatizaciones(db)
}
