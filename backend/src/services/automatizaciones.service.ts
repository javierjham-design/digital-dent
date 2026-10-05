// Gestor de IA (clínica): configura TODA la automatización conversacional con los pacientes
// vía TuBot. Cláriva EMITE los eventos y gobierna qué flujo está encendido + los tiempos de
// detección; el ENVÍO de WhatsApp y la conversación los hace TuBot. La CONEXIÓN con TuBot
// (credenciales/token) la deja el super-admin; acá la clínica solo enciende/apaga y ajusta.
import type { TenantClient } from '@/db/tenant'
import { badRequest } from '@/lib/errors'

const SELECT = {
  agendaWhEnabled: true, agendaWhConnectionId: true,
  automatizacionesEnabled: true, recordatoriosEnabled: true,
  recordatorioHora1: true, recordatorio2Enabled: true, recordatorioHora2: true,
  recapturaNoShowEnabled: true, recapturaTratEnabled: true,
  noShowAutoHoras: true, recapturaDiasPerdido: true, recapturaTratDias: true,
  waTemplateRecordatorio: true, waTemplateRecordInsist: true,
  waTemplateRecapturaNoShow: true, waTemplateRecapturaTrat: true, tubotTemplates: true,
} as const

interface PlantillaTubot { name: string; language?: string; category?: string | null; variables?: number | null }
function parsePlantillas(json: string | null | undefined): PlantillaTubot[] {
  if (!json) return []
  try { const o = JSON.parse(json); return Array.isArray(o) ? o as PlantillaTubot[] : [] } catch { return [] }
}

export async function getAutomatizaciones(db: TenantClient) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: SELECT })
  const tubotConectado = Boolean(c?.agendaWhEnabled && c?.agendaWhConnectionId)
  const plantillasDisponibles = parsePlantillas(c?.tubotTemplates)
  return {
    tubotConectado,
    plantillasDisponibles, // [{name, language, category, variables}] APPROVED, sincronizadas desde TuBot
    maestroActivo: Boolean(c?.automatizacionesEnabled),
    confirmaciones: {
      activo: c?.recordatoriosEnabled ?? true,
      hora1: c?.recordatorioHora1 ?? '12:00',
      segundaActiva: c?.recordatorio2Enabled ?? true,
      hora2: c?.recordatorioHora2 ?? '18:00',
      plantilla: c?.waTemplateRecordatorio ?? null,
      plantillaInsistencia: c?.waTemplateRecordInsist ?? null,
    },
    noShow: { activo: Boolean(c?.recapturaNoShowEnabled), horasAuto: c?.noShowAutoHoras ?? 3, diasPerdido: c?.recapturaDiasPerdido ?? 5, plantilla: c?.waTemplateRecapturaNoShow ?? null },
    tratamiento: { activo: Boolean(c?.recapturaTratEnabled), diasEspera: c?.recapturaTratDias ?? 3, plantilla: c?.waTemplateRecapturaTrat ?? null },
  }
}

const entero = (v: unknown, min: number, max: number, campo: string): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${campo} debe ser un entero entre ${min} y ${max}`)
  return n
}

// HH:MM válido (00:00–23:59). Devuelve minutos del día para comparar.
const horaAMin = (v: unknown, campo: string): number => {
  const s = String(v ?? '').trim()
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!m) throw badRequest(`${campo} debe tener formato HH:MM (ej. 12:00)`)
  return Number(m[1]) * 60 + Number(m[2])
}

export async function putAutomatizaciones(db: TenantClient, body: Record<string, unknown>) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { agendaWhEnabled: true, agendaWhConnectionId: true, tubotTemplates: true } })
  if (!c) throw badRequest('Configuración no encontrada')
  const data: Record<string, unknown> = {}
  const disponibles = parsePlantillas(c.tubotTemplates).map((t) => t.name)
  // Selección de plantilla por flujo: debe ser una APPROVED sincronizada (si hay lista); "" = limpiar.
  const plantilla = (campo: string, valor: unknown): string | null | undefined => {
    if (valor == null) return undefined
    const s = String(valor).trim()
    if (s === '') return null
    if (disponibles.length && !disponibles.includes(s)) throw badRequest(`La plantilla de ${campo} no está entre las aprobadas sincronizadas desde TuBot.`)
    return s
  }
  const pRec = plantilla('confirmación', body.plantillaRecordatorio); if (pRec !== undefined) data.waTemplateRecordatorio = pRec
  const pIns = plantilla('insistencia', body.plantillaInsistencia); if (pIns !== undefined) data.waTemplateRecordInsist = pIns
  const pNo = plantilla('recaptura no-show', body.plantillaNoShow); if (pNo !== undefined) data.waTemplateRecapturaNoShow = pNo
  const pTr = plantilla('recaptura tratamiento', body.plantillaTratamiento); if (pTr !== undefined) data.waTemplateRecapturaTrat = pTr

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
  // Horarios de confirmación (día anterior) + 2ª reconfirmación. La 2ª debe ser POSTERIOR a la 1ª.
  if (body.segundaActiva != null) data.recordatorio2Enabled = Boolean(body.segundaActiva)
  const dioHora1 = body.hora1 != null && String(body.hora1) !== ''
  const dioHora2 = body.hora2 != null && String(body.hora2) !== ''
  if (dioHora1 || dioHora2) {
    const cur = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { recordatorioHora1: true, recordatorioHora2: true } })
    const h1 = dioHora1 ? String(body.hora1).trim() : (cur?.recordatorioHora1 ?? '12:00')
    const h2 = dioHora2 ? String(body.hora2).trim() : (cur?.recordatorioHora2 ?? '18:00')
    const min1 = horaAMin(h1, 'La hora del 1er recordatorio')
    const min2 = horaAMin(h2, 'La hora del 2º recordatorio')
    if (min2 <= min1) throw badRequest('La 2ª reconfirmación debe ser a una hora posterior a la primera.')
    if (dioHora1) data.recordatorioHora1 = h1
    if (dioHora2) data.recordatorioHora2 = h2
  }
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
