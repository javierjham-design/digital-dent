import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const clinica = await prisma.clinica.findUnique({ where: { slug: 'digital-dent' } })
  if (!clinica) throw new Error('No existe')

  console.log('\n=== Primeras 15 prestaciones de digital-dent ordenadas por nombre ===')
  const muestra = await prisma.prestacion.findMany({
    where: { clinicaId: clinica.id },
    orderBy: { nombre: 'asc' },
    take: 15,
    select: { id: true, nombre: true, precio: true, categoria: true },
  })
  for (const p of muestra) {
    const nombreEscaped = JSON.stringify(p.nombre)
    console.log(`  ${nombreEscaped.padEnd(40)} | cat="${p.categoria}" | precio=${p.precio}`)
  }

  console.log('\n=== Primeras 10 de categoría "Implantología" ===')
  const impl = await prisma.prestacion.findMany({
    where: { clinicaId: clinica.id, categoria: { contains: 'mplant', mode: 'insensitive' } },
    take: 10,
    select: { id: true, nombre: true, precio: true, categoria: true },
  })
  for (const p of impl) {
    console.log(`  ${JSON.stringify(p.nombre).padEnd(60)} | cat="${p.categoria}" | precio=${p.precio}`)
  }

  console.log('\n=== Categorías únicas (top 30) ===')
  const cats = await prisma.prestacion.groupBy({
    by: ['categoria'],
    where: { clinicaId: clinica.id },
    _count: true,
    orderBy: { _count: { categoria: 'desc' } },
    take: 30,
  })
  for (const c of cats) {
    console.log(`  ${JSON.stringify(c.categoria)} → ${c._count}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
