import bcrypt from 'bcryptjs'
import { prisma } from './prisma-test'

export const PASSWORD = 'Password123'

export interface TenantFixture {
  clinica: { id: string; slug: string }
  admin: { id: string; username: string }
  doctor: { id: string }
  paciente: { id: string }
}

// Borra en orden FK-safe las tablas que tocan los tests.
export async function resetDb() {
  await prisma.citaLog.deleteMany()
  await prisma.cita.deleteMany()
  await prisma.movimientoCaja.deleteMany()
  await prisma.sesionCaja.deleteMany()
  await prisma.caja.deleteMany()
  await prisma.paciente.deleteMany()
  await prisma.user.deleteMany()
  await prisma.clinica.deleteMany()
}

async function crearTenant(slug: string, n: number): Promise<TenantFixture> {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const clinica = await prisma.clinica.create({ data: { slug, nombre: `Clínica ${slug}`, activo: true, plan: 'PRO', proximoCobro: new Date(Date.now() + 30 * 86400000) } })
  const admin = await prisma.user.create({ data: { clinicaId: clinica.id, name: `Admin ${slug}`, username: 'admin', email: null, password: hash, role: 'admin', activo: true, isPlatformAdmin: false, passwordChangedAt: new Date() } })
  const doctor = await prisma.user.create({ data: { clinicaId: clinica.id, name: `Dr ${slug}`, username: 'doc', email: null, password: hash, role: 'doctor', activo: true, isPlatformAdmin: false, passwordChangedAt: new Date() } })
  const paciente = await prisma.paciente.create({ data: { clinicaId: clinica.id, numero: n, nombre: `Paciente${n}`, apellido: slug, activo: true } })
  return { clinica: { id: clinica.id, slug }, admin: { id: admin.id, username: 'admin' }, doctor: { id: doctor.id }, paciente: { id: paciente.id } }
}

// Planes base. Se siembran explícitamente para que ensureDefaultPlans() salga
// temprano (su createMany usa skipDuplicates, no soportado en sqlite).
async function seedPlanes() {
  if ((await prisma.planSuscripcion.count()) > 0) return
  for (const p of [
    { id: 'TRIAL', nombre: 'Prueba', precioMensual: 0, orden: 0 },
    { id: 'BASICO', nombre: 'Básico', precioMensual: 39900, orden: 1 },
    { id: 'PRO', nombre: 'Pro', precioMensual: 79900, orden: 2 },
  ]) {
    await prisma.planSuscripcion.create({ data: { ...p, descripcion: null, precioAnual: null, caracteristicas: '[]', destacado: false, activo: true } })
  }
}

// Dos clínicas aisladas (A y B) + un super-admin de plataforma.
export async function seedDosClinicas() {
  await resetDb()
  await seedPlanes()
  const A = await crearTenant('clinica-a', 101)
  const B = await crearTenant('clinica-b', 202)
  const hash = await bcrypt.hash(PASSWORD, 10)
  const superAdmin = await prisma.user.create({ data: { clinicaId: null, name: 'Super Admin', username: 'super', email: 'super@clariva.cl', password: hash, role: 'admin', activo: true, isPlatformAdmin: true, passwordChangedAt: new Date() } })
  return { A, B, superAdmin: { id: superAdmin.id, email: 'super@clariva.cl' } }
}
