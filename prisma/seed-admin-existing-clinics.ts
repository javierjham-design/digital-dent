import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEFAULT_ADMIN_USERNAME = 'Administrador'
const DEFAULT_ADMIN_PASSWORD = 'ADMIN22'

async function main() {
  const clinicas = await prisma.clinica.findMany({ where: { activo: true } })
  console.log(`Clínicas activas: ${clinicas.length}`)

  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10)

  for (const c of clinicas) {
    const existente = await prisma.user.findFirst({
      where: { clinicaId: c.id, username: DEFAULT_ADMIN_USERNAME },
    })

    if (existente) {
      console.log(`  [${c.slug}] ya tiene usuario "${DEFAULT_ADMIN_USERNAME}" (id=${existente.id})`)
      continue
    }

    const u = await prisma.user.create({
      data: {
        clinicaId: c.id,
        name: 'Administrador',
        username: DEFAULT_ADMIN_USERNAME,
        email: null,
        password: hash,
        role: 'admin',
        activo: true,
        passwordChangedAt: null,
      },
    })

    console.log(`  [${c.slug}] creado usuario "${DEFAULT_ADMIN_USERNAME}" (id=${u.id})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
