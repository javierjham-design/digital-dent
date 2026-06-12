import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { encryptNullable } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// GET /api/admin/clinicas/[id]/whatsapp — config actual (token NUNCA se devuelve)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const c = await prisma.clinica.findUnique({
    where: { id },
    select: { waEnabled: true, waTwilioSid: true, waNumero: true, waTemplateSid: true, waHorasAntes: true, waTwilioToken: true },
  })
  if (!c) return NextResponse.json({ error: 'Clínica no existe' }, { status: 404 })

  return NextResponse.json({
    waEnabled: c.waEnabled,
    waTwilioSid: c.waTwilioSid,
    waNumero: c.waNumero,
    waTemplateSid: c.waTemplateSid,
    waHorasAntes: c.waHorasAntes,
    tokenConfigurado: Boolean(c.waTwilioToken),
  })
}

// PUT /api/admin/clinicas/[id]/whatsapp — guarda la configuración
// Body: { waEnabled, waTwilioSid, waTwilioToken?, waNumero, waTemplateSid, waHorasAntes }
// El token solo se actualiza si viene no-vacío (permite editar el resto sin re-pegarlo).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const clinica = await prisma.clinica.findUnique({ where: { id }, select: { id: true, slug: true } })
  if (!clinica) return NextResponse.json({ error: 'Clínica no existe' }, { status: 404 })

  const waEnabled = Boolean(body.waEnabled)

  const waNumero = body.waNumero ? String(body.waNumero).trim() : null
  if (waNumero && !/^\+\d{8,15}$/.test(waNumero)) {
    return NextResponse.json({ error: 'waNumero debe estar en formato E.164 (+56912345678)' }, { status: 400 })
  }

  const waTwilioSid = body.waTwilioSid ? String(body.waTwilioSid).trim() : null
  if (waTwilioSid && !/^AC[a-zA-Z0-9]{32}$/.test(waTwilioSid)) {
    return NextResponse.json({ error: 'waTwilioSid no parece un Account SID válido (AC...)' }, { status: 400 })
  }

  const waTemplateSid = body.waTemplateSid ? String(body.waTemplateSid).trim() : null
  if (waTemplateSid && !/^HX[a-zA-Z0-9]{32}$/.test(waTemplateSid)) {
    return NextResponse.json({ error: 'waTemplateSid no parece un Content SID válido (HX...)' }, { status: 400 })
  }

  const waHorasAntes = Number(body.waHorasAntes)
  if (!Number.isInteger(waHorasAntes) || waHorasAntes < 1 || waHorasAntes > 168) {
    return NextResponse.json({ error: 'waHorasAntes debe ser un entero entre 1 y 168' }, { status: 400 })
  }

  if (waEnabled && (!waTwilioSid || !waNumero || !waTemplateSid)) {
    return NextResponse.json({
      error: 'Para habilitar el servicio se necesitan: Account SID, número emisor y Template SID.',
    }, { status: 400 })
  }

  const data: Record<string, unknown> = {
    waEnabled,
    waTwilioSid,
    waNumero,
    waTemplateSid,
    waHorasAntes,
  }
  // Solo pisar el token si vino uno nuevo no-vacío.
  if (typeof body.waTwilioToken === 'string' && body.waTwilioToken.trim()) {
    data.waTwilioToken = encryptNullable(body.waTwilioToken.trim())
  }

  await prisma.clinica.update({ where: { id }, data })

  import('@/lib/audit-admin').then(({ auditAdmin }) => {
    auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'CONFIGURAR_WHATSAPP',
      targetType: 'CLINICA',
      targetId: id,
      details: { clinicaSlug: clinica.slug, waEnabled, waNumero, tokenActualizado: Boolean(data.waTwilioToken) },
      req,
    })
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
