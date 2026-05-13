// Idempotente: corre en cada build de Vercel.
// Crea el usuario super-admin de la plataforma a partir de env vars.
//
// Variables requeridas en Vercel:
//   SUPER_ADMIN_EMAIL    — email de acceso del super-admin
//   SUPER_ADMIN_PASSWORD — password en texto plano (se hashea aquí)
//
// Si las variables no existen, el seed termina sin hacer nada (no falla el build).

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL
  const password = process.env.SUPER_ADMIN_PASSWORD

  if (!email || !password) {
    console.log('seed-super-admin: SUPER_ADMIN_EMAIL o SUPER_ADMIN_PASSWORD no definidas, omitiendo.')
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    // Si ya existe, solo asegura que sea super-admin y esté activo.
    // No sobrescribe la password (para no resetearla en cada build).
    await prisma.user.update({
      where: { email },
      data: { isPlatformAdmin: true, activo: true, clinicaId: null },
    })
    console.log(`seed-super-admin: usuario ${email} actualizado como super-admin.`)
    return
  }

  const hash = await bcrypt.hash(password, 10)
  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      password: hash,
      role: 'admin',
      isPlatformAdmin: true,
      activo: true,
      clinicaId: null,
    },
  })
  console.log(`seed-super-admin: usuario ${email} creado como super-admin.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
