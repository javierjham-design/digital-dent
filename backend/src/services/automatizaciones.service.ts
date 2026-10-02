// Centro de Automatizaciones (clínica): parámetros de DETECCIÓN que gobierna Cláriva —
// cierre automático de inasistencias, paso a PERDIDO y cuándo avisar de un tratamiento no
// tomado. El ENVÍO de WhatsApp (recordatorios y recaptura) y su conversación los gestiona
// TuBot vía la integración de agenda; acá no se configuran mensajes ni plantillas.
import type { TenantClient } from '@/db/tenant'
import { badRequest } from '@/lib/errors'

const SELECT = {
  agendaWhEnabled: true, agendaWhConnectionId: true,
  noShowAutoHoras: true, recapturaDiasPerdido: true, recapturaTratDias: true,
} as const

export async function getAutomatizaciones(db: TenantClient) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: SELECT })
  // "Conectado a TuBot" = la conexión de agenda (Cláriva → TuBot) está activa: por ahí viajan
  // los eventos (cita creada, inasistencia, tratamiento pendiente) que TuBot convierte en mensajes.
  const tubotConectado = Boolean(c?.agendaWhEnabled && c?.agendaWhConnectionId)
  return {
    tubotConectado,
    noShow: { horasAuto: c?.noShowAutoHoras ?? 3, diasPerdido: c?.recapturaDiasPerdido ?? 5 },
    tratamiento: { diasEspera: c?.recapturaTratDias ?? 3 },
  }
}

const entero = (v: unknown, min: number, max: number, campo: string): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${campo} debe ser un entero entre ${min} y ${max}`)
  return n
}

export async function putAutomatizaciones(db: TenantClient, body: Record<string, unknown>) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { id: true } })
  if (!c) throw badRequest('Configuración no encontrada')
  const data: Record<string, unknown> = {}
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
