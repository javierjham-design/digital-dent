import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptNullable } from '@/lib/crypto'
import { procesarRespuestaEntrante, validarFirmaTwilio } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// Webhook de mensajes entrantes de Twilio (respuestas de pacientes).
// Es público a nivel de middleware, pero CADA request se valida con la firma
// X-Twilio-Signature usando el auth token de la clínica dueña del número.
//
// Configurar en Twilio: "When a message comes in" →
//   https://app.clariva.cl/api/whatsapp/webhook  (HTTP POST)

function twiml(mensaje: string | null): NextResponse {
  const inner = mensaje ? `<Message>${escapeXml(mensaje)}</Message>` : ''
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  )
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: NextRequest) {
  // Twilio envía application/x-www-form-urlencoded.
  const form = await req.formData().catch(() => null)
  if (!form) return twiml(null)

  const params: Record<string, string> = {}
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') params[k] = v
  }

  const to = (params.To ?? '').replace(/^whatsapp:/, '')     // nuestro número
  const from = (params.From ?? '').replace(/^whatsapp:/, '') // el paciente
  if (!to || !from) return twiml(null)

  // Resolver clínica por número receptor.
  const clinica = await prisma.clinica.findFirst({
    where: { waNumero: to, waEnabled: true },
    select: { id: true, waTwilioToken: true },
  })
  if (!clinica) return twiml(null)

  // Validar firma con el auth token de esa clínica. Reconstruimos la URL
  // pública exacta que Twilio invocó (Railway está detrás de un proxy).
  const token = decryptNullable(clinica.waTwilioToken)
  if (!token) return twiml(null)

  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host') ?? ''
  const url = `${proto}://${host}/api/whatsapp/webhook`
  const firma = req.headers.get('x-twilio-signature')

  if (!validarFirmaTwilio(token, url, params, firma)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 403 })
  }

  // ButtonText llega cuando el paciente toca un botón de la plantilla;
  // Body cuando escribe libre.
  const texto = params.ButtonText || params.ButtonPayload || params.Body || ''
  if (!texto.trim()) return twiml(null)

  const respuesta = await procesarRespuestaEntrante({
    clinicaId: clinica.id,
    fromE164: from,
    texto,
    originalMessageSid: params.OriginalRepliedMessageSid || null,
  }).catch(() => null)

  return twiml(respuesta)
}
