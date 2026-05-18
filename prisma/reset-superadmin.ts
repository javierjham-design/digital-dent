import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SUPER_EMAIL = 'superadmin@digital-dent.cl'
const NEW_PASSWORD = process.env.NEW_SUPER_PASSWORD ?? 'Clariva2026!'

async function main() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10)
  const updated = await prisma.user.update({
    where: { email: SUPER_EMAIL },
    data: { password: hash, isPlatformAdmin: true, activo: true, passwordChangedAt: new Date() },
    select: { id: true, email: true, isPlatformAdmin: true, activo: true },
  })
  console.log('Super-admin reseteado:')
  console.log(updated)
  console.log(`\nNueva contraseña: ${NEW_PASSWORD}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
