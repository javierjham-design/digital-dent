// Idempotente: corre en cada build de Vercel.
// Migra la base single-tenant a multi-tenant creando una clínica inicial
// y asignando todos los registros existentes a ella.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SLUG_INICIAL = 'digital-dent'

async function main() {
  // 1. Buscar o crear la clínica inicial copiando datos del singleton de Configuracion (legacy).
  let clinica = await prisma.clinica.findUnique({ where: { slug: SLUG_INICIAL } })

  if (!clinica) {
    const config = await prisma.configuracion.findUnique({ where: { id: 'singleton' } })
    clinica = await prisma.clinica.create({
      data: {
        slug: SLUG_INICIAL,
        nombre: config?.clinica ?? 'Clínica Digital-Dent',
        direccion: config?.direccion ?? '',
        ciudad: config?.ciudad ?? 'Temuco',
        telefono: config?.telefono ?? '',
        email: config?.email ?? '',
        mensajeWA: config?.mensajeWA ?? 'Hola {nombre}, te escribimos de *{clinica}* para confirmar tu cita el {fecha} en {direccion}.',
        logoUrl: config?.logoUrl ?? null,
        plan: 'PRO',
        activo: true,
      },
    })
    console.log(`Clínica inicial creada: ${clinica.id}`)
  } else {
    console.log(`Clínica inicial ya existe: ${clinica.id}`)
  }

  // 2. Asignar la clínica a todos los registros huérfanos (clinicaId IS NULL).
  const tablas = [
    'user', 'paciente', 'cita', 'fichaClinica', 'prestacion',
    'tratamiento', 'presupuesto', 'cobro', 'medioPago',
    'contrato', 'liquidacion', 'horarioDoctor',
  ] as const

  for (const t of tablas) {
    const r = await (prisma as any)[t].updateMany({
      where: { clinicaId: null },
      data: { clinicaId: clinica.id },
    })
    if (r.count > 0) console.log(`  ${t}: ${r.count} registros migrados`)
  }

  console.log('Migración multi-tenant completada.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
