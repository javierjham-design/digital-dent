import bcrypt from 'bcryptjs'
import { control } from '@/db/control'
import { badRequest, tooMany } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { getVertical } from '@/lib/verticales'
import { provisionTenant, dropTenantDatabase, dbNameForSlug } from '@/lib/provision'
import { seedTenantBasics, seedDemoTenant } from '@/lib/tenant-seed'
import { issueTokenForTenantUser } from '@/services/auth.service'
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

// Genera una clínica demo (sandbox) con su propia base de datos, datos
// ficticios del rubro, y devuelve un token para entrar directo. Captura el lead
// en el control-plane. Público y rate-limited.
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
  while (await control.clinica.findUnique({ where: { slug } })) slug = slugDemo()
  const dbName = dbNameForSlug(slug)

  const expira = new Date()
  expira.setDate(expira.getDate() + DEMO_DIAS)
  const password = 'Demo' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89)
  const passwordHash = await bcrypt.hash(password, 10)

  // 1) base física + schema, 2) seed (admin + datos del rubro), 3) registro.
  await provisionTenant(dbName)
  try {
    const { adminId } = await seedTenantBasics(dbName, { nombre: nombreClinica, telefono, email }, {
      name: nombre, username: 'Administrador', passwordHash, forcePasswordChange: false,
    })
    await seedDemoTenant(dbName, vertical)

    const clinica = await control.clinica.create({
      data: {
        slug, dbName, nombre: nombreClinica, email, telefono,
        plan: 'TRIAL', trialHasta: expira, activo: true, esDemo: true, demoExpiraEn: expira,
      },
    })
    await control.lead.create({
      data: { nombre, email, telefono: telefono || null, nombreClinica, origen: 'DEMO', rubro: vertical, clinicaId: clinica.id, clinicaSlug: slug, ip },
    })

    const session = await issueTokenForTenantUser({ id: clinica.id, slug, dbName }, adminId)
    return { ...session, slug, loginUrl: `/c/${slug}/login`, usuario: 'Administrador', password, expiraEn: expira.toISOString() }
  } catch (e) {
    await dropTenantDatabase(dbName).catch(() => {})
    throw e
  }
}

// Borra las clínicas demo expiradas: elimina su base física y su registro.
export async function limpiarDemosExpiradas(): Promise<{ revisadas: number; borradas: number; errores: { slug: string; error: string }[] }> {
  const expiradas = await control.clinica.findMany({
    where: { esDemo: true, demoExpiraEn: { lt: new Date() } },
    select: { id: true, slug: true, dbName: true },
  })
  let borradas = 0
  const errores: { slug: string; error: string }[] = []
  for (const c of expiradas) {
    try {
      await dropTenantDatabase(c.dbName)
      await control.clinica.delete({ where: { id: c.id } })
      borradas++
    } catch (e) {
      errores.push({ slug: c.slug, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { revisadas: expiradas.length, borradas, errores }
}
