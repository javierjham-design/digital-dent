// Siembra inicial de la base de una clínica recién provisionada: su
// Configuracion (perfil) y el usuario administrador. Datos clínicos ricos
// (demo) se siembran aparte con seedDemoTenant.
import bcrypt from 'bcryptjs'
import { tenantClient } from '@/db/tenant'
import { getVertical } from '@/lib/verticales'

export interface PerfilClinica {
  nombre: string
  rut?: string | null
  direccion?: string
  ciudad?: string
  telefono?: string
  email?: string
  mensajeWA?: string
}

export interface SeedAdmin {
  name: string
  username?: string
  email?: string | null
  passwordHash: string
  // true → passwordChangedAt = null → fuerza cambio en el primer ingreso.
  forcePasswordChange?: boolean
}

// Crea Configuracion (singleton) + usuario admin en la base del tenant.
// Devuelve el id del admin (para emitir token de auto-login en el flujo demo).
export async function seedTenantBasics(dbName: string, perfil: PerfilClinica, admin: SeedAdmin): Promise<{ adminId: string }> {
  const db = tenantClient(dbName)

  await db.configuracion.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      nombre: perfil.nombre,
      rut: perfil.rut ?? null,
      direccion: perfil.direccion ?? '',
      ciudad: perfil.ciudad ?? 'Temuco',
      telefono: perfil.telefono ?? '',
      email: perfil.email ?? '',
      ...(perfil.mensajeWA ? { mensajeWA: perfil.mensajeWA } : {}),
    },
  })

  const force = admin.forcePasswordChange ?? true
  const user = await db.user.create({
    data: {
      name: admin.name,
      username: admin.username ?? 'Administrador',
      email: admin.email ?? null,
      password: admin.passwordHash,
      role: 'admin',
      activo: true,
      passwordChangedAt: force ? null : new Date(),
    },
  })
  return { adminId: user.id }
}

const PACIENTES_DEMO = [
  { nombre: 'Cristina', apellido: 'Riffo', telefono: '+56 9 9111 2233' },
  { nombre: 'Juan', apellido: 'Muñoz', telefono: '+56 9 9222 3344' },
  { nombre: 'Sara', apellido: 'Catalán', telefono: '+56 9 9333 4455' },
  { nombre: 'Carlos', apellido: 'Vega', telefono: '+56 9 9444 5566' },
  { nombre: 'José', apellido: 'Vidal', telefono: '+56 9 9555 6677' },
]

// Datos de muestra para una clínica DEMO según su rubro: catálogo de
// prestaciones, profesionales (doctores) y algunos pacientes de ejemplo.
export async function seedDemoTenant(dbName: string, verticalId: string): Promise<void> {
  const v = getVertical(verticalId)
  const db = tenantClient(dbName)

  // Idempotente: solo sembrar prestaciones si la base aún no tiene ninguna
  // (evita duplicar el catálogo si el seed se ejecuta más de una vez).
  const yaHayPrestaciones = await db.prestacion.count()
  if (yaHayPrestaciones === 0) {
    await db.prestacion.createMany({
      data: v.seed.prestaciones.map((p) => ({ nombre: p.nombre, precio: p.precio, duracion: p.duracion, categoria: p.categoria, activo: true })),
    })
  }

  const hash = await bcrypt.hash('Demo' + Math.random().toString(36).slice(2, 10), 10)
  let i = 0
  for (const prof of v.seed.profesionales) {
    i++
    await db.user.create({
      data: { name: prof.name, username: `doctor-${i}`, email: null, password: hash, role: 'doctor', especialidad: prof.especialidad, activo: true, passwordChangedAt: new Date() },
    })
  }

  let n = 0
  for (const p of PACIENTES_DEMO) {
    n++
    await db.paciente.create({ data: { numero: n, nombre: p.nombre, apellido: p.apellido, telefono: p.telefono, activo: true } })
  }
}
