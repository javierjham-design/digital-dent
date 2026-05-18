import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const clinicas = await prisma.clinica.findMany({
    select: { id: true, slug: true, nombre: true, activo: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log('=== Clínicas registradas ===')
  for (const c of clinicas) {
    console.log(`  slug="${c.slug}" nombre="${c.nombre}" activo=${c.activo}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
