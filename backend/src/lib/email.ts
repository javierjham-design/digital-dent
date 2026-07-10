// Envío de correo transaccional con Resend. Un solo dominio de envío de la
// plataforma (verificado con SPF/DKIM); el nombre del remitente lleva el de la
// clínica ("Clínica X · vía Cláriva") y el Reply-To apunta al correo de la
// clínica, para que las respuestas del paciente lleguen a su casilla.
//
// Credenciales SOLO por env: RESEND_API_KEY, EMAIL_FROM_ADDRESS (ej.
// no-reply@clariva.cl), EMAIL_FROM_SUFFIX (ej. "vía Cláriva"). Sin API key, el
// envío devuelve un error claro (no rompe la operación).

const FROM_ADDRESS = () => process.env.EMAIL_FROM_ADDRESS || 'no-reply@clariva.cl'
const FROM_SUFFIX = () => process.env.EMAIL_FROM_SUFFIX || 'vía Cláriva'

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export interface EmailAdjunto { filename: string; contentBase64: string }
export interface EnviarEmailArgs {
  to: string
  fromNombre?: string | null   // nombre de la clínica (aparece como remitente)
  replyTo?: string | null      // correo de la clínica (respuestas del paciente)
  subject: string
  html: string
  attachments?: EmailAdjunto[]
}
export interface EmailResult { ok: boolean; id?: string; error?: string }

// Construye el "from" como `Nombre · vía Cláriva <no-reply@clariva.cl>`.
function fromHeader(fromNombre?: string | null): string {
  const base = FROM_ADDRESS()
  const nombre = (fromNombre || '').trim()
  const label = nombre ? `${nombre} · ${FROM_SUFFIX()}` : 'Cláriva'
  // Saneamos el nombre (sin comillas ni ángulos que rompan el header).
  return `${label.replace(/["<>]/g, '')} <${base}>`
}

export async function enviarEmail(a: EnviarEmailArgs): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'El correo no está configurado en el servidor (falta RESEND_API_KEY).' }
  try {
    const body: Record<string, unknown> = {
      from: fromHeader(a.fromNombre),
      to: [a.to],
      subject: a.subject,
      html: a.html,
    }
    if (a.replyTo) body.reply_to = a.replyTo
    if (a.attachments?.length) body.attachments = a.attachments.map((x) => ({ filename: x.filename, content: x.contentBase64 }))
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (r.ok && data.id) return { ok: true, id: data.id }
    return { ok: false, error: data.message ?? `Resend respondió ${r.status}.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo conectar con el servicio de correo.' }
  }
}
