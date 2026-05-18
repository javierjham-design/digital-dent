import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SLUG = process.env.SLUG ?? 'digital-dent'
const USERNAME = process.env.ADMIN_USERNAME ?? 'Administrador'
const NEW_PASSWORD = process.env.NEW_ADMIN_PASSWORD ?? 'ADMIN22'

async function main() {
  const clinica = await prisma.clinica.findUnique({ where: { slug: SLUG } })
  if (!clinica) throw new Error(`Clínica con slug "${SLUG}" no existe`)

  const user = await prisma.user.findFirst({
    where: { clinicaId: clinica.id, username: USERNAME },
  })
  if (!user) throw new Error(`Usuario "${USERNAME}" no existe en clínica "${SLUG}"`)

  const hash = await bcrypt.hash(NEW_PASSWORD, 10)
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hash,
      activo: true,
      passwordChangedAt: null, // null = forzar cambio en primer login
    },
    select: { id: true, username: true, activo: true, passwordChangedAt: true },
  })

  console.log('Usuario reseteado:')
  console.log(updated)
  console.log(`\nClínica: ${SLUG}`)
  console.log(`Usuario: ${USERNAME}`)
  console.log(`Contraseña: ${NEW_PASSWORD}`)
  console.log(`\n⚠️ passwordChangedAt = null → al entrar la primera vez te pedirá cambiarla.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
