// ─────────────────────────────────────────────────────────────────────────────
//  Recordatorio/confirmación de citas por WhatsApp — canal TuBot (por plantilla)
// ─────────────────────────────────────────────────────────────────────────────
//
//  Flujo:
//   1. El cron llama a enviarRecordatoriosPendientes() → por cada cita próxima
//      (dentro de waHorasAntes) sin recordatorio, envía la plantilla aprobada con
//      botones [Confirmar][Cancelar][Reagendar] vía TuBot (idempotente por cita).
//   2. El paciente toca un botón → TuBot POSTea a /whatsapp/webhook/{connectionId}
//      → procesarEventoEntrante() actualiza el estado de la cita, deja log y manda
//      el acuse por texto (la ventana de 24 h la abrió el botón). Idempotente.
//   3. TuBot también envía eventos "status" (sent/delivered/read/failed): failed
//      queda visible en la agenda ("no se pudo entregar").
//
//  Este módulo NO conoce el transporte: habla con la frontera de proveedor
//  (lib/tubot.ts). Contrato completo en docs/TUBOT_WHATSAPP.md.
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { decryptNullable } from '@/lib/crypto'
import { tubotProvider, RateLimitError, type TubotConfig, type EventoEntrante } from '@/lib/tubot'

// Config de WhatsApp de una clínica ya resuelta (secretos descifrados).
interface WaConfig {
  cfg: TubotConfig            // lo que necesita el proveedor para enviar
  connectionId: string
  webhookSecret: string
  horasAntes: number
  nombre: string
}

const CONFIG_SELECT = {
  nombre: true, waEnabled: true, waApiKey: true, waConnectionId: true,
  waWebhookSecret: true, waTemplateName: true, waTemplateLang: true, waHorasAntes: true,
} as const

function resolverConfig(c: {
  nombre: string; waEnabled: boolean; waApiKey: string | null; waConnectionId: string | null
  waWebhookSecret: string | null; waTemplateName: string | null; waTemplateLang: string; waHorasAntes: number
}): WaConfig | null {
  if (!c.waEnabled || !c.waApiKey || !c.waConnectionId || !c.waWebhookSecret || !c.waTemplateName) return null
  const apiKey = decryptNullable(c.waApiKey)
  const webhookSecret = decryptNullable(c.waWebhookSecret)
  if (!apiKey || !webhookSecret) return null
  return {
    cfg: { apiKey, templateName: c.waTemplateName, templateLang: c.waTemplateLang },
    connectionId: c.waConnectionId, webhookSecret, horasAntes: c.waHorasAntes, nombre: c.nombre,
  }
}

/** Normaliza un teléfono chileno a E.164 (+569XXXXXXXX). null si no es usable. */
export function fonoAE164(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  let num = telefono.replace(/\D/g, '')
  if (!num) return null
  if (num.startsWith('0')) num = num.slice(1)
  if (num.length <= 9) num = '56' + num
  if (num.length < 10 || num.length > 15) return null
  return `+${num}`
}

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLegible = (d: Date) => `${DIAS_ES[d.getDay()]} ${d.getDate()} de ${MESES_ES[d.getMonth()]}`
const horaLegible = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })

// Idempotency-Key del envío: cita + fecha + número de intento. El auto usa n=1
// (un reintento del cron por timeout no duplica); el reenvío manual incrementa n.
const idemKey = (citaId: string, fecha: Date, intento: number) => `cita_${citaId}_${fecha.toISOString()}_${intento}`

/**
 * Envía el recordatorio de UNA cita con las credenciales ya resueltas de su clínica.
 * `intento` alimenta la Idempotency-Key (1 = automático). Devuelve el messageId.
 */
export async function enviarRecordatorioCita(
  db: TenantClient, citaId: string, wa: WaConfig, intento = 1,
): Promise<string> {
  const cita = await db.cita.findUnique({
    where: { id: citaId },
    include: { paciente: { select: { nombre: true, telefono: true } } },
  })
  if (!cita) throw new Error('Cita no encontrada')
  const to = fonoAE164(cita.paciente.telefono)
  if (!to) throw new Error('El paciente no tiene teléfono válido')

  const fecha = new Date(cita.fecha)
  const { messageId } = await tubotProvider.enviarPlantilla(wa.cfg, {
    to,
    variables: [cita.paciente.nombre, wa.nombre, fechaLegible(fecha), horaLegible(fecha)],
    botones: [{ payload: 'CONFIRMAR' }, { payload: 'CANCELAR' }, { payload: 'REAGENDAR' }],
    idempotencyKey: idemKey(citaId, fecha, intento),
  })

  await db.cita.update({
    where: { id: citaId },
    data: {
      waMessageSid: messageId,
      waDeliveryStatus: null, waDeliveryReason: null, // arranca sin estado; lo actualiza el evento "status"
      // Al enviar, la cita pasa a "Notificado por WhatsApp" (sólo desde Agendada).
      ...(cita.estado === 'PENDIENTE' ? { estado: 'CONFIRMADA' } : {}),
      logs: { create: { tipo: 'WA_ENVIADO', detalle: `Recordatorio ${intento > 1 ? `(reenvío #${intento - 1}) ` : ''}enviado por WhatsApp a ${to}`, userName: 'Sistema' } },
    },
  })
  return messageId
}

/** Reenvío MANUAL de una cita (la paciente dice que no le llegó). Incrementa el
 *  número de intento para saltar el dedupe de TuBot. La config del tenant ya exige
 *  waEnabled + credenciales. */
export async function reenviarRecordatorioManual(db: TenantClient, citaId: string): Promise<string> {
  const config = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: CONFIG_SELECT })
  const wa = config ? resolverConfig(config) : null
  if (!wa) throw new Error('El servicio de WhatsApp no está habilitado o faltan credenciales (TuBot).')
  const cita = await db.cita.findUnique({ where: { id: citaId }, select: { waReenvios: true } })
  if (!cita) throw new Error('Cita no encontrada')
  const intento = cita.waReenvios + 2 // auto = 1; primer manual = 2, luego 3, 4…
  const id = await enviarRecordatorioCita(db, citaId, wa, intento)
  await db.cita.update({ where: { id: citaId }, data: { waReenvios: { increment: 1 } } })
  return id
}

/**
 * Para el cron: envía recordatorios de todas las citas elegibles.
 * Elegible = clínica con waEnabled, cita PENDIENTE, sin recordatorio previo,
 * cuya fecha cae dentro de las próximas waHorasAntes horas (y no pasó).
 */
export async function enviarRecordatoriosPendientes(): Promise<{ enviados: number; errores: { citaId: string; error: string }[] }> {
  const clinicas = await control.clinica.findMany({
    where: { waEnabled: true, activo: true, esDemo: false },
    select: { dbName: true },
  })
  let enviados = 0
  const errores: { citaId: string; error: string }[] = []

  for (const cl of clinicas) {
    const db = tenantClient(cl.dbName)
    const config = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: CONFIG_SELECT })
    const wa = config ? resolverConfig(config) : null
    if (!wa) continue

    const ahora = new Date()
    const hasta = new Date(ahora.getTime() + wa.horasAntes * 3600_000)
    const citas = await db.cita.findMany({
      where: { estado: 'PENDIENTE', waMessageSid: null, fecha: { gte: ahora, lte: hasta } },
      select: { id: true },
      take: 100, // tope de seguridad por corrida
    })

    for (const c of citas) {
      try {
        await enviarRecordatorioCita(db, c.id, wa, 1)
        enviados++
      } catch (e) {
        if (e instanceof RateLimitError) {
          // Respetamos el rate limit: cortamos la tanda de ESTA clínica; las citas
          // no enviadas quedan sin waMessageSid y entran en la próxima corrida.
          errores.push({ citaId: c.id, error: `rate_limited (retry-after ${e.retryAfterSeg}s) — corte de tanda` })
          break
        }
        errores.push({ citaId: c.id, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  return { enviados, errores }
}

// ─── Webhook: eventos entrantes de TuBot ─────────────────────────────────────

export type RespuestaPaciente = 'CONFIRMAR' | 'CANCELAR' | 'REAGENDAR' | 'OTRO'

// RESPALDO: sólo para el paciente que ESCRIBE en vez de tocar el botón. El camino
// principal es el payload estructurado del botón (no pasa por acá).
export function interpretarRespuesta(texto: string): RespuestaPaciente {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/confirm|\bsi\b|\bok\b|asistire/.test(t)) return 'CONFIRMAR'
  if (/cancel|anul|no puedo|no podre|no asistire/.test(t)) return 'CANCELAR'
  if (/reagend|cambiar|otro dia|otra hora|reprogram/.test(t)) return 'REAGENDAR'
  return 'OTRO'
}

// Correlaciona un evento entrante con una cita: por el messageId respondido
// (replyTo → waMessageSid) o, si no, por el teléfono del paciente.
async function citaDelEvento(db: TenantClient, args: { replyTo: string | null; from: string }) {
  if (args.replyTo) {
    const c = await db.cita.findFirst({ where: { waMessageSid: args.replyTo }, select: { id: true, estado: true, fecha: true, paciente: { select: { telefono: true } } } })
    if (c) return c
  }
  const digits = args.from.replace(/\D/g, '')
  const sinPais = digits.startsWith('56') ? digits.slice(2) : digits
  const candidatos = await db.cita.findMany({
    where: { waMessageSid: { not: null }, estado: { in: ['PENDIENTE', 'CONFIRMADA', 'CONFIRMADO'] }, fecha: { gte: new Date(Date.now() - 3600_000) } },
    include: { paciente: { select: { telefono: true } } }, orderBy: { fecha: 'asc' }, take: 50,
  })
  const m = candidatos.find((c) => { const t = (c.paciente.telefono ?? '').replace(/\D/g, ''); return t.length >= 8 && (t.endsWith(sinPais) || sinPais.endsWith(t)) })
  return m ? { id: m.id, estado: m.estado, fecha: m.fecha, paciente: m.paciente } : null
}

/**
 * Procesa un evento entrante de TuBot (respuesta de botón, texto o status).
 * IDEMPOTENTE por providerMsgId: reprocesar el mismo evento (doble toque, reintento
 * de TuBot) es no-op. Manda el acuse por texto cuando corresponde.
 */
export async function procesarEventoEntrante(db: TenantClient, wa: WaConfig, evento: EventoEntrante): Promise<void> {
  // Idempotencia: el @unique de providerMsgId frena el reproceso.
  try {
    await db.waEventoEntrante.create({ data: { providerMsgId: evento.providerMsgId, tipo: evento.tipo } })
  } catch {
    return // ya procesado
  }

  // ── Evento de estado de entrega ──
  if (evento.tipo === 'status') {
    const cita = await db.cita.findFirst({ where: { waMessageSid: evento.providerMsgId }, select: { id: true } })
    if (!cita) return
    const detalle = evento.status === 'failed'
      ? `No se pudo entregar el recordatorio por WhatsApp${evento.reason ? ` (${evento.reason})` : ''}`
      : `WhatsApp ${evento.status}`
    await db.cita.update({
      where: { id: cita.id },
      data: { waDeliveryStatus: evento.status, waDeliveryReason: evento.reason ?? null, logs: { create: { tipo: 'WA_ESTADO', detalle, userName: 'Sistema' } } },
    })
    return
  }

  // ── Respuesta del paciente (botón = principal; texto = respaldo) ──
  const respuesta: RespuestaPaciente = evento.tipo === 'button'
    ? (['CONFIRMAR', 'CANCELAR', 'REAGENDAR'].includes(evento.payload) ? evento.payload as RespuestaPaciente : 'OTRO')
    : interpretarRespuesta(evento.texto)

  const cita = await citaDelEvento(db, { replyTo: evento.replyTo, from: evento.from })
  if (!cita) return

  const fecha = new Date(cita.fecha)
  const cuando = `${fechaLegible(fecha)} a las ${horaLegible(fecha)}`
  const to = fonoAE164(cita.paciente?.telefono) ?? fonoAE164(evento.from)
  let ack: string | null = null

  if (respuesta === 'CONFIRMAR') {
    await db.cita.update({ where: { id: cita.id }, data: { estado: 'CONFIRMADO', confirmadoWA: true, logs: { create: { tipo: 'ESTADO', detalle: 'Cita confirmada por el paciente vía WhatsApp', userName: 'Paciente (WhatsApp)' } } } })
    ack = `¡Gracias! Tu cita del ${cuando} quedó confirmada. Te esperamos.`
  } else if (respuesta === 'CANCELAR') {
    await db.cita.update({ where: { id: cita.id }, data: { estado: 'CANCELADA', logs: { create: { tipo: 'ESTADO', detalle: 'Cita cancelada por el paciente vía WhatsApp', userName: 'Paciente (WhatsApp)' } } } })
    ack = `Tu cita del ${cuando} fue cancelada. Si quieres reagendar, contáctanos.`
  } else if (respuesta === 'REAGENDAR') {
    // Se MARCA y se DERIVA a la clínica (visible en agenda). El reagendamiento
    // automático es de la integración inversa, no de este módulo.
    await db.cita.update({ where: { id: cita.id }, data: { logs: { create: { tipo: 'WA_REAGENDAR', detalle: 'El paciente pidió REAGENDAR vía WhatsApp — derivado a la clínica', userName: 'Paciente (WhatsApp)' } } } })
    ack = `Recibimos tu solicitud de reagendar la cita del ${cuando}. Te contactaremos a la brevedad para coordinar un nuevo horario.`
  } else {
    // Texto libre no interpretable: queda en el log para recepción.
    await db.cita.update({ where: { id: cita.id }, data: { logs: { create: { tipo: 'ESTADO', detalle: `Mensaje del paciente por WhatsApp: "${evento.texto.slice(0, 200)}"`, userName: 'Paciente (WhatsApp)' } } } })
  }

  // Acuse por texto libre (la ventana de 24 h la abrió el botón). Best-effort.
  if (ack && to) await tubotProvider.enviarTexto(wa.cfg, to, ack).catch(() => undefined)
}

// Resuelve la clínica dueña de una connectionId y su WaConfig (para el webhook).
export async function configPorConexion(connectionId: string): Promise<{ dbName: string; wa: WaConfig } | null> {
  const clinica = await control.clinica.findFirst({ where: { waConnectionId: connectionId, waEnabled: true }, select: { dbName: true } })
  if (!clinica) return null
  const db = tenantClient(clinica.dbName)
  const config = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: CONFIG_SELECT })
  const wa = config ? resolverConfig(config) : null
  return wa ? { dbName: clinica.dbName, wa } : null
}
