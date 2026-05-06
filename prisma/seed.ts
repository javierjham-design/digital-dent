import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@digitaldent.cl' } })
  if (!existing) {
    await prisma.user.create({
      data: {
        name: 'Administrador',
        email: 'admin@digitaldent.cl',
        password: await bcrypt.hash('DigitalDent2024!', 10),
        role: 'admin',
      },
    })
    console.log('Usuario admin creado: admin@digitaldent.cl / DigitalDent2024!')
  } else {
    console.log('Usuario admin ya existe')
  }

  const prestaciones = [
    { nombre: 'Consulta de diagnostico',     categoria: 'GENERAL',        precio: 25000 },
    { nombre: 'Radiografia periapical',       categoria: 'DIAGNOSTICO',    precio: 8000 },
    { nombre: 'Detartaje completo',           categoria: 'PREVENCION',     precio: 45000 },
    { nombre: 'Limpieza y profilaxis',        categoria: 'PREVENCION',     precio: 30000 },
    { nombre: 'Obturacion simple (resina)',   categoria: 'RESTAURACION',   precio: 35000 },
    { nombre: 'Obturacion compuesta',         categoria: 'RESTAURACION',   precio: 55000 },
    { nombre: 'Endodoncia molar',             categoria: 'ENDODONCIA',     precio: 180000 },
    { nombre: 'Exodoncia simple',             categoria: 'CIRUGIA',        precio: 40000 },
    { nombre: 'Corona metal-porcelana',       categoria: 'PROTESIS',       precio: 280000 },
    { nombre: 'Ortodoncia mensualidad',       categoria: 'ORTODONCIA',     precio: 65000 },
    { nombre: 'Implante dental',              categoria: 'IMPLANTOLOGIA',  precio: 750000 },
    { nombre: 'Blanqueamiento dental',        categoria: 'ESTETICA',       precio: 120000 },
  ]

  let created = 0
  for (const p of prestaciones) {
    const exists = await prisma.prestacion.findFirst({ where: { nombre: p.nombre } })
    if (!exists) {
      await prisma.prestacion.create({ data: { ...p, activo: true } })
      created++
    }
  }
  console.log(`Prestaciones: ${created} creadas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
