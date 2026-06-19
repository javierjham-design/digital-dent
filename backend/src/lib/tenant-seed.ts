// Siembra inicial de la base de una clínica recién provisionada: su
// Configuracion (perfil) y el usuario administrador. Datos clínicos ricos
// (demo) se siembran aparte en el flujo de demo.
import { tenantClient } from '@/db/tenant'

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
