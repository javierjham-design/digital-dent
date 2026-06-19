// Alta de clínicas en el modelo database-per-tenant: deriva slug y dbName,
// PROVISIONA la base física (CREATE DATABASE + schema), la siembra y registra
// la clínica en el control-plane. Si algo falla tras crear la base, la elimina
// (best-effort) para no dejar bases huérfanas.
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { control } from '@/db/control'
import { badRequest } from '@/lib/errors'
import { provisionTenant, dropTenantDatabase, dbNameForSlug } from '@/lib/provision'
import { seedTenantBasics } from '@/lib/tenant-seed'

const PLANES_VALIDOS = ['TRIAL', 'BASICO', 'PRO']
const DEFAULT_ADMIN_USERNAME = 'Administrador'

const RESERVED_SLUGS = new Set([
  'super-admin', 'www', 'admin', 'api', 'app', 'mail', 'login', 'auth', 'panel',
  'dashboard', 'support', 'soporte', 'help', 'ayuda', 'blog', 'docs', 'status', 'cdn', 'assets', 'static',
])

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
}

function generarPassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += charset[bytes[i] % charset.length]
  return out
}

// Encuentra un slug libre (no reservado y no usado en el control-plane).
async function slugLibre(base: string): Promise<string> {
  let slug = base
  let i = 1
  while (await control.clinica.findUnique({ where: { slug } })) { i++; slug = `${base}-${i}` }
  return slug
}

export interface CrearClinicaInput {
  clinicaNombre: string
  clinicaEmail?: string
  clinicaTelefono?: string
  clinicaDireccion?: string
  clinicaCiudad?: string
  rut?: string
  plan?: string
  trialDias?: number
  slug?: string
}

export interface CrearClinicaResult {
  clinica: { id: string; slug: string; dbName: string; nombre: string }
  credenciales: { usuario: string; contrasena: string }
}

export async function crearClinicaConProvision(body: CrearClinicaInput): Promise<CrearClinicaResult> {
  if (!body.clinicaNombre?.trim()) throw badRequest('Falta el nombre de la clínica')

  const baseSlug = (body.slug ? slugify(body.slug) : slugify(body.clinicaNombre)) || 'clinica'
  if (RESERVED_SLUGS.has(baseSlug)) throw badRequest(`El código "${baseSlug}" está reservado por la plataforma. Elige otro.`)
  const slug = await slugLibre(baseSlug)
  const dbName = dbNameForSlug(slug)

  const plan = body.plan && PLANES_VALIDOS.includes(body.plan) ? body.plan : 'TRIAL'
  let trialHasta: Date | null = null
  if (plan === 'TRIAL') {
    const dias = Number(body.trialDias) > 0 ? Number(body.trialDias) : 30
    trialHasta = new Date()
    trialHasta.setDate(trialHasta.getDate() + dias)
  }

  const contrasena = generarPassword()
  const passwordHash = await bcrypt.hash(contrasena, 10)

  // 1) provisionar base física + schema, 2) sembrar, 3) registrar en control.
  await provisionTenant(dbName)
  try {
    await seedTenantBasics(dbName, {
      nombre: body.clinicaNombre.trim(),
      rut: body.rut ?? null,
      direccion: body.clinicaDireccion,
      ciudad: body.clinicaCiudad,
      telefono: body.clinicaTelefono,
      email: body.clinicaEmail,
    }, { name: 'Administrador', username: DEFAULT_ADMIN_USERNAME, passwordHash, forcePasswordChange: true })

    const clinica = await control.clinica.create({
      data: {
        slug, dbName, nombre: body.clinicaNombre.trim(), rut: body.rut ?? null,
        email: body.clinicaEmail ?? '', telefono: body.clinicaTelefono ?? '',
        plan, trialHasta, activo: true,
      },
    })
    return { clinica: { id: clinica.id, slug, dbName, nombre: clinica.nombre }, credenciales: { usuario: DEFAULT_ADMIN_USERNAME, contrasena } }
  } catch (e) {
    // Rollback best-effort: si falló el seed o el registro, borrar la base.
    await dropTenantDatabase(dbName).catch(() => {})
    throw e
  }
}
