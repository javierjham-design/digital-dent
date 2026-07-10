import type { TenantClient } from '@/db/tenant'
import { badRequest } from '@/lib/errors'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { enviarEmail, emailConfigurado, type EmailAdjunto } from '@/lib/email'
import { plantillaBase, confirmacionHoraHtml, mensajeConAdjuntoHtml, type ClinicaEmail } from '@/lib/email-templates'

export const TIPOS_EMAIL = ['CONFIRMACION_HORA', 'PRESUPUESTO', 'CONSENTIMIENTO', 'DOCUMENTO', 'COMPROBANTE', 'PLAN', 'DEUDA', 'OTRO'] as const
export type TipoEmail = typeof TIPOS_EMAIL[number]

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

async function datosClinica(db: TenantClient): Promise<ClinicaEmail & { emailNotificaciones: boolean }> {
  const c = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { nombre: true, direccion: true, telefono: true, email: true, logoUrl: true, emailNotificaciones: true },
  })
  return {
    nombre: c?.nombre ?? 'Clínica', direccion: c?.direccion ?? null, telefono: c?.telefono ?? null,
    email: c?.email ?? null, logoUrl: c?.logoUrl ?? null, emailNotificaciones: c?.emailNotificaciones ?? true,
  }
}

export interface EnviarCorreoInput {
  to: string
  tipo: TipoEmail
  asunto: string
  html: string
  attachments?: EmailAdjunto[]
  pacienteId?: string | null
}

// Envía un correo desde la clínica (From = nombre de la clínica, Reply-To = su
// correo) y lo registra en el historial. Devuelve el resultado (no lanza en fallo
// de envío: registra el ERROR y lo informa).
export async function enviarCorreoClinica(db: TenantClient, input: EnviarCorreoInput, actor?: JwtPayload) {
  const para = (input.to || '').trim().toLowerCase()
  if (!emailValido(para)) throw badRequest('Falta un correo de destino válido.')
  const clinica = await datosClinica(db)

  const res = await enviarEmail({
    to: para, fromNombre: clinica.nombre, replyTo: clinica.email,
    subject: input.asunto, html: input.html, attachments: input.attachments,
  })

  await db.emailEnviado.create({
    data: {
      para, asunto: input.asunto, tipo: input.tipo, pacienteId: input.pacienteId ?? null,
      estado: res.ok ? 'ENVIADO' : 'ERROR', providerId: res.id ?? null, error: res.ok ? null : (res.error ?? 'error'),
      enviadoPorId: actor?.sub ?? null, enviadoPorNombre: actor ? actorName(actor) : null,
    },
  }).catch(() => {})

  return res
}

// Envío manual genérico (endpoint): valida el tipo, arma el HTML si no viene, y
// adjunta el PDF (base64) que genera el frontend.
export async function enviarManual(
  db: TenantClient, actor: JwtPayload,
  body: { to: string; tipo?: string; asunto: string; mensaje?: string; html?: string; pacienteId?: string; pacienteNombre?: string; pdfBase64?: string; pdfNombre?: string },
) {
  const tipo = (TIPOS_EMAIL as readonly string[]).includes(String(body.tipo)) ? (body.tipo as TipoEmail) : 'OTRO'
  if (!body.asunto?.trim()) throw badRequest('Falta el asunto del correo.')
  const clinica = await datosClinica(db)
  const html = body.html?.trim()
    ? body.html
    : mensajeConAdjuntoHtml(clinica, { paciente: body.pacienteNombre ?? null, titulo: body.asunto, mensaje: body.mensaje ?? null })
  const nombreArch = (body.pdfNombre || 'documento').trim()
  // Respeta la extensión real del archivo (imágenes, PDF…); sólo agrega .pdf si no tiene.
  const filename = /\.[a-z0-9]{2,5}$/i.test(nombreArch) ? nombreArch : `${nombreArch}.pdf`
  const attachments: EmailAdjunto[] | undefined = body.pdfBase64
    ? [{ filename, contentBase64: body.pdfBase64.replace(/^data:.*;base64,/, '') }]
    : undefined

  const res = await enviarCorreoClinica(db, { to: body.to, tipo, asunto: body.asunto.trim(), html, attachments, pacienteId: body.pacienteId ?? null }, actor)
  if (!res.ok) throw badRequest(res.error ?? 'No se pudo enviar el correo.')
  return { ok: true }
}

// Confirmación de hora automática (best-effort): sólo si hay email del paciente,
// el correo está configurado y la clínica no desactivó las notificaciones.
export async function enviarConfirmacionHora(
  db: TenantClient,
  d: { email?: string | null; pacienteId?: string | null; pacienteNombre: string; fecha: Date; profesional?: string | null; tipo?: string | null; nota?: string | null },
): Promise<void> {
  try {
    const email = (d.email ?? '').trim().toLowerCase()
    if (!email || !emailValido(email) || !emailConfigurado()) return
    const clinica = await datosClinica(db)
    if (!clinica.emailNotificaciones) return
    const fechaTexto = d.fecha.toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
    const html = confirmacionHoraHtml(clinica, { paciente: d.pacienteNombre, fechaTexto, profesional: d.profesional, tipo: d.tipo, nota: d.nota })
    await enviarCorreoClinica(db, { to: email, tipo: 'CONFIRMACION_HORA', asunto: `Tu hora en ${clinica.nombre}`, html, pacienteId: d.pacienteId ?? null })
  } catch { /* best-effort: nunca hace fallar la reserva/cita */ }
}

// Sencilla plantilla base expuesta por si un caller quiere envolver contenido propio.
export function envolver(db: TenantClient, contenidoHtml: string) {
  return datosClinica(db).then((c) => plantillaBase(c, contenidoHtml))
}

export async function listarEmails(db: TenantClient, pacienteId?: string) {
  return db.emailEnviado.findMany({
    where: pacienteId ? { pacienteId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: pacienteId ? 100 : 200,
  })
}
