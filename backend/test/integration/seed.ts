import bcrypt from 'bcryptjs'
import { control } from './control-test'
import { tenantClient } from './tenant-test'
import { dbNameForSlug } from '@/lib/provision'
import { TEST_SLUGS } from './fixtures'

export const PASSWORD = 'Password123'

export interface TenantFixture { clinicaId: string; slug: string; dbName: string; adminId: string; pacienteId: string }

async function resetControl() {
  await control.pagoSuscripcion.deleteMany()
  await control.extraSuscripcion.deleteMany()
  await control.lead.deleteMany()
  await control.clinica.deleteMany()
  await control.platformAdmin.deleteMany()
  await control.auditLogAdmin.deleteMany()
}

// Planes base (ensureDefaultPlans usa createMany skipDuplicates → no soportado en sqlite).
async function seedPlanes() {
  if ((await control.planSuscripcion.count()) > 0) return
  for (const p of [
    { id: 'TRIAL', nombre: 'Prueba', precioMensual: 0, orden: 0 },
    { id: 'BASICO', nombre: 'Básico', precioMensual: 19900, orden: 1 },
    { id: 'PRO', nombre: 'Pro', precioMensual: 39900, orden: 2 },
  ]) {
    await control.planSuscripcion.create({ data: { ...p, descripcion: null, precioAnual: null, caracteristicas: '[]', destacado: false, activo: true } })
  }
}

async function resetYSeedTenant(dbName: string, n: number) {
  const db = tenantClient(dbName)
  await db.citaLog.deleteMany()
  await db.cita.deleteMany()
  await db.paciente.deleteMany()
  await db.user.deleteMany()
  await db.configuracion.deleteMany()

  const hash = await bcrypt.hash(PASSWORD, 10)
  await db.configuracion.create({ data: { id: 'singleton', nombre: `Clínica ${n}` } })
  const admin = await db.user.create({ data: { name: `Admin ${n}`, username: 'admin', email: null, password: hash, role: 'admin', activo: true, passwordChangedAt: new Date() } })
  await db.user.create({ data: { name: `Dr ${n}`, username: 'doc', email: null, password: hash, role: 'doctor', activo: true, passwordChangedAt: new Date() } })
  const paciente = await db.paciente.create({ data: { numero: n, nombre: `Paciente${n}`, apellido: dbName, activo: true } })
  return { adminId: admin.id, pacienteId: paciente.id }
}

// 2 clínicas, cada una en SU PROPIA base física, + un super-admin de plataforma.
export async function seedDosClinicas() {
  await resetControl()
  await seedPlanes()

  const fixtures: Record<string, TenantFixture> = {}
  let n = 100
  for (const slug of TEST_SLUGS) {
    n++
    const dbName = dbNameForSlug(slug)
    const { adminId, pacienteId } = await resetYSeedTenant(dbName, n)
    const clinica = await control.clinica.create({
      data: { slug, dbName, nombre: `Clínica ${slug}`, activo: true, plan: 'PRO', proximoCobro: new Date(Date.now() + 30 * 86400000) },
    })
    fixtures[slug] = { clinicaId: clinica.id, slug, dbName, adminId, pacienteId }
  }

  const hash = await bcrypt.hash(PASSWORD, 10)
  const superAdmin = await control.platformAdmin.create({ data: { name: 'Super Admin', email: 'super@clariva.cl', password: hash, activo: true, passwordChangedAt: new Date() } })

  return { A: fixtures['clinica-a'], B: fixtures['clinica-b'], superAdmin: { id: superAdmin.id, email: 'super@clariva.cl' } }
}
