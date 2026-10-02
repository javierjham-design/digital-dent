// Centro de Automatizaciones (clínica): comportamiento de los recordatorios, el cierre
// automático de no-shows y la recaptura por WhatsApp. Las CREDENCIALES de TuBot (API key,
// connection id, secreto) las administra el Super-Admin; acá la clínica sólo gobierna el
// comportamiento. Al activar una recaptura se verifica que su plantilla esté APROBADA.
import type { TenantClient } from '@/db/tenant'
import { badRequest } from '@/lib/errors'
import { decryptNullable } from '@/lib/crypto'
import { tubotProvider } from '@/lib/tubot'

const SELECT = {
  waEnabled: true, waApiKey: true, waConnectionId: true, waTemplateName: true, waTemplateLang: true, waHorasAntes: true,
  noShowAutoHoras: true, recapturaDiasPerdido: true,
  recapturaNoShowEnabled: true, waTemplateRecapturaNoShow: true,
  recapturaTratEnabled: true, waTemplateRecapturaTrat: true, recapturaTratDias: true,
} as const

export async function getAutomatizaciones(db: TenantClient) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: SELECT })
  // "Conectado" = el Super-Admin ya dejó WhatsApp operativo (credenciales + plantilla base).
  const whatsappConectado = Boolean(c?.waEnabled && c?.waApiKey && c?.waConnectionId && c?.waTemplateName)
  return {
    whatsappConectado,
    recordatorios: { activo: Boolean(c?.waEnabled), horasAntes: c?.waHorasAntes ?? 24 },
    noShow: { horasAuto: c?.noShowAutoHoras ?? 3, diasPerdido: c?.recapturaDiasPerdido ?? 5 },
    recaptura: {
      noShow: { activo: Boolean(c?.recapturaNoShowEnabled), plantilla: c?.waTemplateRecapturaNoShow ?? null },
      tratamiento: { activo: Boolean(c?.recapturaTratEnabled), plantilla: c?.waTemplateRecapturaTrat ?? null, dias: c?.recapturaTratDias ?? 3 },
    },
  }
}

const entero = (v: unknown, min: number, max: number, campo: string): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${campo} debe ser un entero entre ${min} y ${max}`)
  return n
}

export async function putAutomatizaciones(db: TenantClient, body: Record<string, unknown>) {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: SELECT })
  if (!c) throw badRequest('Configuración no encontrada')
  const data: Record<string, unknown> = {}

  // Recordatorios: horas de anticipación del recordatorio de cita.
  if (body.recordatoriosHorasAntes != null && String(body.recordatoriosHorasAntes) !== '') {
    data.waHorasAntes = entero(body.recordatoriosHorasAntes, 1, 168, 'Las horas de anticipación')
  }
  // Cierre automático de no-shows + ventana de PERDIDO.
  if (body.noShowHorasAuto != null && String(body.noShowHorasAuto) !== '') {
    data.noShowAutoHoras = entero(body.noShowHorasAuto, 1, 72, 'Las horas para marcar no-show automático')
  }
  if (body.perdidoDias != null && String(body.perdidoDias) !== '') {
    data.recapturaDiasPerdido = entero(body.perdidoDias, 1, 60, 'Los días para marcar PERDIDO')
  }

  // Recaptura (dos flujos): toggles + plantillas + días.
  const recapNoShow = Boolean(body.recapturaNoShowEnabled)
  const tplNoShow = body.waTemplateRecapturaNoShow ? String(body.waTemplateRecapturaNoShow).trim() : null
  const recapTrat = Boolean(body.recapturaTratEnabled)
  const tplTrat = body.waTemplateRecapturaTrat ? String(body.waTemplateRecapturaTrat).trim() : null
  data.recapturaNoShowEnabled = recapNoShow
  data.waTemplateRecapturaNoShow = tplNoShow
  data.recapturaTratEnabled = recapTrat
  data.waTemplateRecapturaTrat = tplTrat
  if (body.recapturaTratDias != null && String(body.recapturaTratDias) !== '') {
    data.recapturaTratDias = entero(body.recapturaTratDias, 1, 60, 'Los días para recaptura de tratamiento')
  }

  // Activar una recaptura exige WhatsApp conectado + su plantilla APROBADA en TuBot/Meta.
  const apiKey = decryptNullable(c.waApiKey)
  for (const r of [
    { on: recapNoShow, tpl: tplNoShow, nombre: 'recaptura de no-show' },
    { on: recapTrat, tpl: tplTrat, nombre: 'recaptura de tratamiento' },
  ]) {
    if (!r.on) continue
    if (!c.waEnabled || !apiKey) throw badRequest('Primero el equipo de Cláriva debe conectar WhatsApp para tu clínica.')
    if (!r.tpl) throw badRequest(`Falta el nombre de la plantilla de ${r.nombre}.`)
    let estado: string
    try { estado = (await tubotProvider.estadoPlantilla({ apiKey, templateName: r.tpl, templateLang: c.waTemplateLang })).status }
    catch (e) { throw badRequest(`No se pudo verificar la plantilla de ${r.nombre}: ${e instanceof Error ? e.message : 'error'}`) }
    if (estado !== 'APPROVED') throw badRequest(`La plantilla "${r.tpl}" (${r.nombre}) está ${estado}. No se puede activar hasta que Meta la apruebe.`)
  }

  await db.configuracion.update({ where: { id: 'singleton' }, data })
  return getAutomatizaciones(db)
}
