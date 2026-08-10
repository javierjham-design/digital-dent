import bcrypt from 'bcryptjs'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { badRequest, tooMany, serviceUnavailable } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { getVertical } from '@/lib/verticales'
import { AREA_POR_VERTICAL, MODULO_POR_AREA } from '@shared/constants/areas'
import { MODULOS_DEFAULT } from '@shared/constants/modulos'
import { provisionTenant, dropTenantDatabase, dbNameForSlug } from '@/lib/provision'
import { seedTenantBasics, seedDemoTenant } from '@/lib/tenant-seed'
import { issueTokenForTenantUser } from '@/services/auth.service'
import { log } from '@/lib/logger'
import { captureError } from '@/lib/observability'
import type { LoginResponse } from '@shared/types'

const DEMO_DIAS = 7

// ── Red de seguridad de la limpieza de demos ─────────────────────────────────
// El job diario borra demos EXPIRADAS. Como el flag `esDemo` puede estar mal (p. ej.
// demo-dv20mz nació con esDemo=false por un error de datos; el error inverso marcaría
// una clínica real como demo), la limpieza se NIEGA a borrar una base que no PAREZCA
// una demo, aunque esté marcada como tal. Una clínica real jamás pasa este filtro.
const MAX_PACIENTES_DEMO = 50 // seedDemoTenant siembra 5; margen 10× (una clínica real tiene cientos/miles)
const MAX_VIDA_DEMO_MS = 30 * 24 * 60 * 60 * 1000 // un demo vive ~DEMO_DIAS; 30 d de margen

// Criterio PURO (testeable): ¿esta base marcada como demo parece de verdad un demo?
export function pareceDemo(a: { pacientes: number; createdAt: Date; demoExpiraEn: Date | null }): { ok: boolean; motivo?: string } {
  if (a.pacientes > MAX_PACIENTES_DEMO) {
    return { ok: false, motivo: `tiene ${a.pacientes} pacientes (> ${MAX_PACIENTES_DEMO}): parece una clínica real, no un demo` }
  }
  if (!a.demoExpiraEn) {
    return { ok: false, motivo: 'no tiene demoExpiraEn: no fue creada por el flujo de demo' }
  }
  const vidaMs = a.demoExpiraEn.getTime() - a.createdAt.getTime()
  if (vidaMs <= 0 || vidaMs > MAX_VIDA_DEMO_MS) {
    return { ok: false, motivo: `vida útil de ${Math.round(vidaMs / 86_400_000)} d no condice con un demo (~${DEMO_DIAS} d)` }
  }
  return { ok: true }
}

async function contarPacientes(dbName: string): Promise<number> {
  try {
    const rows = await tenantClient(dbName).$queryRawUnsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM "Paciente"')
    return rows[0]?.n ?? 0
  } catch { return 0 }
}

function slugDemo(): string {
  return `demo-${Math.random().toString(36).slice(2, 8)}`
}

export interface CrearDemoInput {
  nombre: string; email: string; telefono?: string; nombreClinica: string; vertical?: string
  pais?: string // país de la landing (CR/PA/CO/...) para atribución de campaña
  tracking?: Record<string, string | undefined> // UTM + landing (desde la landing page)
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

  // 1) base física + schema (con self-check), 2) seed (admin + datos del rubro), 3) registro.
  try {
    await provisionTenant(dbName)
  } catch {
    // provisionTenant ya borró la base a medio crear y reportó a Sentry. El lead ve un
    // error limpio (503), no un 500 crudo con "Error interno del servidor".
    throw serviceUnavailable('No pudimos preparar tu demo en este momento. Probá de nuevo en unos minutos.')
  }
  try {
    const { adminId } = await seedTenantBasics(dbName, { nombre: nombreClinica, telefono, email }, {
      name: nombre, username: 'Administrador', passwordHash, forcePasswordChange: false,
    })
    await seedDemoTenant(dbName, vertical)

    // La clínica nace con los módulos base + el área de su vertical (una demo
    // estética nace con area_estetica; una dental con area_dental).
    const areaInicial = AREA_POR_VERTICAL[vertical] ?? 'DENTAL'
    const clinica = await control.clinica.create({
      data: {
        slug, dbName, nombre: nombreClinica, email, telefono,
        plan: 'TRIAL', trialHasta: expira, activo: true, esDemo: true, demoExpiraEn: expira,
        vertical, modulos: `${MODULOS_DEFAULT},${MODULO_POR_AREA[areaInicial]}`,
      },
    })
    const t = input.tracking ?? {}
    await control.lead.create({
      data: {
        nombre, email, telefono: telefono || null, nombreClinica, origen: 'DEMO', rubro: vertical,
        clinicaId: clinica.id, clinicaSlug: slug, ip,
        estado: 'DEMO_ACTIVA', // el lead ya creó su demo → arranca en "demo activa"
        pais: input.pais || null,
        utmSource: t.utmSource || null, utmMedium: t.utmMedium || null, utmCampaign: t.utmCampaign || null,
      },
    })

    const session = await issueTokenForTenantUser({ id: clinica.id, slug, dbName }, adminId)
    return { ...session, slug, loginUrl: `/c/${slug}/login`, usuario: 'Administrador', password, expiraEn: expira.toISOString() }
  } catch (e) {
    await dropTenantDatabase(dbName).catch(() => {})
    throw e
  }
}

// Borra las clínicas demo expiradas: elimina su base física y su registro.
export async function limpiarDemosExpiradas(): Promise<{
  revisadas: number; borradas: number
  rechazadas: { slug: string; motivo: string }[]
  errores: { slug: string; error: string }[]
}> {
  const expiradas = await control.clinica.findMany({
    where: { esDemo: true, demoExpiraEn: { lt: new Date() } },
    select: { id: true, slug: true, dbName: true, createdAt: true, demoExpiraEn: true },
  })
  let borradas = 0
  const rechazadas: { slug: string; motivo: string }[] = []
  const errores: { slug: string; error: string }[] = []
  for (const c of expiradas) {
    try {
      // Red contra el flag mal puesto: NO borrar una base que no parezca un demo,
      // aunque esté marcada como tal. Si se rechaza, se loguea y reporta a Sentry —
      // así una base rara (mal marcada, o una clínica real) sale a la superficie en
      // vez de que un job automático la borre de madrugada o la ignore en silencio.
      const pacientes = await contarPacientes(c.dbName)
      const chequeo = pareceDemo({ pacientes, createdAt: c.createdAt, demoExpiraEn: c.demoExpiraEn })
      if (!chequeo.ok) {
        log.error('limpieza de demos: base marcada demo pero NO parece un demo, se rechaza', {
          slug: c.slug, dbName: c.dbName, pacientes, motivo: chequeo.motivo,
        })
        captureError(new Error(`Limpieza de demos rechazó "${c.slug}" (${c.dbName}): ${chequeo.motivo}`), { route: 'demo/cleanup' })
        rechazadas.push({ slug: c.slug, motivo: chequeo.motivo! })
        continue
      }
      await dropTenantDatabase(c.dbName)
      await control.clinica.delete({ where: { id: c.id } })
      borradas++
    } catch (e) {
      errores.push({ slug: c.slug, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { revisadas: expiradas.length, borradas, rechazadas, errores }
}
