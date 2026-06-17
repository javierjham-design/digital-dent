import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { badRequest, tooMany } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { seedDemoClinica } from '@/lib/demo-seed'
import { borrarClinicaDemo } from '@/lib/demo-cleanup'
import { getVertical } from '@/lib/verticales'
import { issueTokenForUserId } from '@/services/auth.service'
import type { LoginResponse } from '@shared/types'

const DEMO_DIAS = 7

function slugDemo(): string {
  return `demo-${Math.random().toString(36).slice(2, 8)}`
}

export interface CrearDemoInput {
  nombre: string; email: string; telefono?: string; nombreClinica: string; vertical?: string
}

export interface DemoResult extends LoginResponse {
  slug: string
  loginUrl: string
  usuario: string
  password: string
  expiraEn: string
}

// Genera una clínica demo (sandbox) con datos ficticios del rubro y devuelve
// un token para que el prospecto entre directo. Captura el lead. Público y
// rate-limited (igual semántica que el monolito).
export async function crearDemo(input: CrearDemoInput, ip: string): Promise<DemoResult> {
  const nombre = input.nombre?.trim()
  const email = input.email?.trim().toLowerCase()
  const telefono = input.telefono?.trim() ?? ''
  const nombreClinica = input.nombreClinica?.trim()
  const vertical = getVertical(input.vertical).id

  if (!nombre || !email || !nombreClinica) throw badRequest('Completa nombre, email y nombre de la clínica.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('El correo no parece válido.')

  const rlIp = rateLimit(`demo:ip:${ip}`, { limit: 3, windowMs: 60 * 60_000 })
  if (!rlIp.ok) throw tooMany('Generaste varias demos seguidas. Intenta nuevamente en un rato.')
  const rlEmail = rateLimit(`demo:email:${email}`, { limit: 2, windowMs: 24 * 60 * 60_000 })
  if (!rlEmail.ok) throw tooMany('Ya creaste una demo con este correo hoy. Revisa tu bandeja o escríbenos.')

  let slug = slugDemo()
  while (await prisma.clinica.findUnique({ where: { slug } })) slug = slugDemo()

  const expira = new Date()
  expira.setDate(expira.getDate() + DEMO_DIAS)
  const password = 'Demo' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89)
  const hash = await bcrypt.hash(password, 10)

  const { clinica, adminId } = await prisma.$transaction(async (tx) => {
    const c = await tx.clinica.create({
      data: { slug, nombre: nombreClinica, email, telefono, ciudad: 'Temuco', plan: 'TRIAL', trialHasta: expira, esDemo: true, demoExpiraEn: expira, activo: true },
    })
    const admin = await tx.user.create({
      data: { clinicaId: c.id, name: nombre, username: 'Administrador', email: null, password: hash, role: 'admin', activo: true, passwordChangedAt: new Date() },
    })
    await tx.lead.create({
      data: { nombre, email, telefono: telefono || null, nombreClinica, origen: 'DEMO', rubro: vertical, clinicaId: c.id, clinicaSlug: slug, ip },
    })
    return { clinica: c, adminId: admin.id }
  })

  try {
    await seedDemoClinica(clinica.id, vertical)
  } catch (e) {
    console.error('[demo] seed falló:', e)
  }

  const session = await issueTokenForUserId(adminId)
  return {
    ...session,
    slug,
    loginUrl: `/c/${slug}/login`,
    usuario: 'Administrador',
    password,
    expiraEn: expira.toISOString(),
  }
}

export async function limpiarDemosExpiradas(): Promise<{ revisadas: number; borradas: number; errores: { slug: string; error: string }[] }> {
  const expiradas = await prisma.clinica.findMany({
    where: { esDemo: true, demoExpiraEn: { lt: new Date() } },
    select: { id: true, slug: true },
  })
  let borradas = 0
  const errores: { slug: string; error: string }[] = []
  for (const c of expiradas) {
    try { await borrarClinicaDemo(c.id); borradas++ }
    catch (e) { errores.push({ slug: c.slug, error: e instanceof Error ? e.message : String(e) }) }
  }
  return { revisadas: expiradas.length, borradas, errores }
}
