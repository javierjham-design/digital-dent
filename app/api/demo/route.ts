import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { seedDemoClinica } from '@/lib/demo-seed'
import { getVertical } from '@/lib/verticales'
import { RESERVED_SLUGS } from '@/app/api/admin/clinicas/route'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const DEMO_DIAS = 7

function clientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for') ?? ''
  return xf.split(',')[0].trim() || 'unknown'
}

function slugDemo(): string {
  const r = Math.random().toString(36).slice(2, 8)
  return `demo-${r}`
}

// POST /api/demo — un prospecto genera una clínica de prueba desde la landing.
// Crea la clínica (esDemo), un admin con credenciales conocidas, el lead, y
// la puebla con datos ficticios. Devuelve las credenciales para auto-login.
export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const nombre = String(body.nombre ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const telefono = String(body.telefono ?? '').trim()
  const nombreClinica = String(body.nombreClinica ?? '').trim()
  const vertical = getVertical(body.vertical).id // valida; default 'dental'

  if (!nombre || !email || !nombreClinica) {
    return NextResponse.json({ error: 'Completa nombre, email y nombre de la clínica.' }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'El correo no parece válido.' }, { status: 400 })
  }

  // Anti-abuso: por IP y por email.
  const rlIp = rateLimit(`demo:ip:${ip}`, { limit: 3, windowMs: 60 * 60_000 })
  if (!rlIp.ok) {
    return NextResponse.json(
      { error: 'Generaste varias demos seguidas. Intenta nuevamente en un rato.' },
      { status: 429, headers: { 'Retry-After': String(rlIp.retryAfterSec) } },
    )
  }
  const rlEmail = rateLimit(`demo:email:${email}`, { limit: 2, windowMs: 24 * 60 * 60_000 })
  if (!rlEmail.ok) {
    return NextResponse.json(
      { error: 'Ya creaste una demo con este correo hoy. Revisa tu bandeja o escríbenos.' },
      { status: 429, headers: { 'Retry-After': String(rlEmail.retryAfterSec) } },
    )
  }

  // Slug único.
  let slug = slugDemo()
  while ((await prisma.clinica.findUnique({ where: { slug } })) || RESERVED_SLUGS.has(slug)) {
    slug = slugDemo()
  }

  const expira = new Date()
  expira.setDate(expira.getDate() + DEMO_DIAS)

  // Password de la demo: aleatoria, devuelta una vez para el auto-login.
  const password = 'Demo' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89)
  const hash = await bcrypt.hash(password, 10)

  const clinica = await prisma.$transaction(async (tx) => {
    const c = await tx.clinica.create({
      data: {
        slug,
        nombre: nombreClinica,
        email,
        telefono,
        ciudad: 'Temuco',
        plan: 'TRIAL',
        trialHasta: expira,
        esDemo: true,
        demoExpiraEn: expira,
        activo: true,
      },
    })
    await tx.user.create({
      data: {
        clinicaId: c.id,
        name: nombre,
        username: 'Administrador',
        email: null,
        password: hash,
        role: 'admin',
        activo: true,
        passwordChangedAt: new Date(), // no forzar cambio: la demo entra directo
      },
    })
    await tx.lead.create({
      data: {
        nombre, email, telefono: telefono || null,
        nombreClinica, origen: 'DEMO', rubro: vertical,
        clinicaId: c.id, clinicaSlug: slug, ip,
      },
    })
    return c
  })

  // Poblar con datos ficticios del rubro elegido. Si algo falla, la demo igual
  // existe (vacía); por eso lo intentamos pero no rompemos la respuesta.
  try {
    await seedDemoClinica(clinica.id, vertical)
  } catch (e) {
    console.error('[demo] seed falló:', e)
  }

  return NextResponse.json({
    ok: true,
    slug,
    loginUrl: `/c/${slug}/login`,
    usuario: 'Administrador',
    password,
    expiraEn: expira.toISOString(),
  }, { status: 201 })
}
