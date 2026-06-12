import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'
import { decryptNullable } from '@/lib/crypto'

// ─────────────────────────────────────────────────────────────────────────────
//  Confirmaciones automáticas de citas por WhatsApp (Twilio)
// ─────────────────────────────────────────────────────────────────────────────
//
//  Flujo:
//   1. Un cron llama a enviarRecordatoriosPendientes() → por cada cita próxima
//      (dentro de la ventana waHorasAntes de su clínica) que aún no recibió
//      recordatorio, envía la plantilla aprobada de Twilio con botones
//      [Confirmar] [Reagendar] [Cancelar].
//   2. El paciente toca un botón → Twilio hace POST a /api/whatsapp/webhook →
//      procesarRespuestaEntrante() actualiza el estado de la cita y deja log.
//
//  Convención de variables de la plantilla (definir igual en Twilio Content):
//   {{1}} = nombre del paciente   {{2}} = nombre de la clínica
//   {{3}} = fecha legible         {{4}} = hora (HH:mm)
//
//  Usamos la REST API de Twilio directo con fetch (sin SDK: es un solo POST).

const TWILIO_API = 'https://api.twilio.com/2010-04-01'

interface TwilioCreds {
  sid: string
  token: string
  from: string        // número emisor E.164
  templateSid: string
}

function credsDeClinica(c: {
  waEnabled: boolean
  waTwilioSid: string | null
  waTwilioToken: string | null
  waNumero: string | null
  waTemplateSid: string | null
}): TwilioCreds | null {
  if (!c.waEnabled || !c.waTwilioSid || !c.waTwilioToken || !c.waNumero || !c.waTemplateSid) return null
  const token = decryptNullable(c.waTwilioToken)
  if (!token) return null
  return { sid: c.waTwilioSid, token, from: c.waNumero, templateSid: c.waTemplateSid }
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

function fechaLegible(d: Date): string {
  return `${DIAS_ES[d.getDay()]} ${d.getDate()} de ${MESES_ES[d.getMonth()]}`
}

function horaLegible(d: Date): string {
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Envía el recordatorio de UNA cita. Devuelve el MessageSid o lanza error. */
export async function enviarRecordatorioCita(citaId: string): Promise<string> {
  const cita = await prisma.cita.findUnique({
    where: { id: citaId },
    include: {
      paciente: { select: { nombre: true, apellido: true, telefono: true } },
      clinica: {
        select: {
          nombre: true, waEnabled: true, waTwilioSid: true, waTwilioToken: true,
          waNumero: true, waTemplateSid: true,
        },
      },
    },
  })
  if (!cita?.clinica) throw new Error('Cita o clínica no encontrada')

  const creds = credsDeClinica(cita.clinica)
  if (!creds) throw new Error('La clínica no tiene WhatsApp configurado/habilitado')

  const to = fonoAE164(cita.paciente.telefono)
  if (!to) throw new Error('El paciente no tiene teléfono válido')

  const fecha = new Date(cita.fecha)
  const variables = JSON.stringify({
    '1': cita.paciente.nombre,
    '2': cita.clinica.nombre,
    '3': fechaLegible(fecha),
    '4': horaLegible(fecha),
  })

  const body = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${creds.from}`,
    ContentSid: creds.templateSid,
    ContentVariables: variables,
  })

  const res = await fetch(`${TWILIO_API}/Accounts/${creds.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${creds.sid}:${creds.token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const data = await res.json().catch(() => ({})) as { sid?: string; message?: string }
  if (!res.ok || !data.sid) {
    throw new Error(`Twilio ${res.status}: ${data.message ?? 'error desconocido'}`)
  }

  await prisma.cita.update({
    where: { id: citaId },
    data: {
      waMessageSid: data.sid,
      logs: {
        create: {
          tipo: 'WA_ENVIADO',
          detalle: `Recordatorio automático enviado por WhatsApp a ${to}`,
          userName: 'Sistema',
        },
      },
    },
  })

  return data.sid
}

/**
 * Para el cron: envía recordatorios de todas las citas elegibles.
 * Elegible = clínica con waEnabled, cita PENDIENTE, sin recordatorio previo,
 * y cuya fecha está dentro de las próximas waHorasAntes horas (pero no pasada).
 */
export async function enviarRecordatoriosPendientes(): Promise<{
  enviados: number
  errores: { citaId: string; error: string }[]
}> {
  const clinicas = await prisma.clinica.findMany({
    where: { waEnabled: true, activo: true },
    select: { id: true, waHorasAntes: true },
  })

  let enviados = 0
  const errores: { citaId: string; error: string }[] = []

  for (const cl of clinicas) {
    const ahora = new Date()
    const hasta = new Date(ahora.getTime() + cl.waHorasAntes * 3600_000)

    const citas = await prisma.cita.findMany({
      where: {
        clinicaId: cl.id,
        estado: 'PENDIENTE',
        waMessageSid: null,
        fecha: { gte: ahora, lte: hasta },
      },
      select: { id: true },
      take: 100, // tope de seguridad por corrida
    })

    for (const c of citas) {
      try {
        await enviarRecordatorioCita(c.id)
        enviados++
      } catch (e) {
        errores.push({ citaId: c.id, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  return { enviados, errores }
}

// ─── Webhook: respuesta del paciente ────────────────────────────────────────

export type RespuestaPaciente = 'CONFIRMAR' | 'CANCELAR' | 'REAGENDAR' | 'OTRO'

export function interpretarRespuesta(texto: string): RespuestaPaciente {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/confirm|\bsi\b|\bok\b|asistire/.test(t)) return 'CONFIRMAR'
  if (/cancel|anul|no puedo|no podre|no asistire/.test(t)) return 'CANCELAR'
  if (/reagend|cambiar|otro dia|otra hora|reprogram/.test(t)) return 'REAGENDAR'
  return 'OTRO'
}

/**
 * Valida la firma X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + params
 * ordenados por clave)). Protege el webhook de requests falsificadas.
 */
export function validarFirmaTwilio(
  authToken: string,
  url: string,
  params: Record<string, string>,
  firma: string | null,
): boolean {
  if (!firma) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const esperada = createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
  // Comparación en tiempo constante simple (las longitudes son fijas).
  if (esperada.length !== firma.length) return false
  let diff = 0
  for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ firma.charCodeAt(i)
  return diff === 0
}

/**
 * Procesa una respuesta entrante del paciente. Devuelve el texto de respuesta
 * a mostrar al paciente (o null si no se identificó la cita).
 */
export async function procesarRespuestaEntrante(args: {
  clinicaId: string
  fromE164: string                 // teléfono del paciente
  texto: string                    // ButtonText o Body
  originalMessageSid: string | null
}): Promise<string | null> {
  const respuesta = interpretarRespuesta(args.texto)

  // 1) Correlación exacta: respuesta a un mensaje nuestro.
  let cita = args.originalMessageSid
    ? await prisma.cita.findFirst({
        where: { clinicaId: args.clinicaId, waMessageSid: args.originalMessageSid },
        select: { id: true, estado: true, fecha: true },
      })
    : null

  // 2) Fallback: próxima cita con recordatorio enviado de un paciente cuyo
  //    teléfono coincida.
  if (!cita) {
    const digits = args.fromE164.replace(/\D/g, '')
    const sinPais = digits.startsWith('56') ? digits.slice(2) : digits
    const candidatos = await prisma.cita.findMany({
      where: {
        clinicaId: args.clinicaId,
        waMessageSid: { not: null },
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        fecha: { gte: new Date(Date.now() - 3600_000) },
      },
      include: { paciente: { select: { telefono: true } } },
      orderBy: { fecha: 'asc' },
      take: 50,
    })
    const match = candidatos.find((c) => {
      const t = (c.paciente.telefono ?? '').replace(/\D/g, '')
      return t.length >= 8 && (t.endsWith(sinPais) || sinPais.endsWith(t))
    })
    if (match) cita = { id: match.id, estado: match.estado, fecha: match.fecha }
  }

  if (!cita) return null

  const fecha = new Date(cita.fecha)
  const cuando = `${fechaLegible(fecha)} a las ${horaLegible(fecha)}`

  if (respuesta === 'CONFIRMAR') {
    await prisma.cita.update({
      where: { id: cita.id },
      data: {
        estado: 'CONFIRMADA',
        confirmadoWA: true,
        logs: { create: { tipo: 'ESTADO', detalle: 'Cita confirmada por el paciente vía WhatsApp', userName: 'Paciente (WhatsApp)' } },
      },
    })
    return `¡Gracias! Tu cita del ${cuando} quedó confirmada. Te esperamos.`
  }

  if (respuesta === 'CANCELAR') {
    await prisma.cita.update({
      where: { id: cita.id },
      data: {
        estado: 'CANCELADA',
        logs: { create: { tipo: 'ESTADO', detalle: 'Cita cancelada por el paciente vía WhatsApp', userName: 'Paciente (WhatsApp)' } },
      },
    })
    return `Tu cita del ${cuando} fue cancelada. Si quieres reagendar, contáctanos.`
  }

  if (respuesta === 'REAGENDAR') {
    await prisma.cita.update({
      where: { id: cita.id },
      data: {
        logs: { create: { tipo: 'ESTADO', detalle: 'El paciente pidió reagendar vía WhatsApp', userName: 'Paciente (WhatsApp)' } },
      },
    })
    return `Recibimos tu solicitud de reagendar la cita del ${cuando}. Te contactaremos a la brevedad para coordinar un nuevo horario.`
  }

  // Mensaje libre: lo dejamos en el log para que recepción lo vea.
  await prisma.cita.update({
    where: { id: cita.id },
    data: {
      logs: { create: { tipo: 'ESTADO', detalle: `Mensaje del paciente por WhatsApp: "${args.texto.slice(0, 200)}"`, userName: 'Paciente (WhatsApp)' } },
    },
  })
  return null
}
