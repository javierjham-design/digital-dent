import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const allUsers = await prisma.user.findMany({
    select: {
      id: true, email: true, username: true, name: true, role: true,
      isPlatformAdmin: true, activo: true, clinicaId: true,
    },
    orderBy: [{ isPlatformAdmin: 'desc' }, { createdAt: 'asc' }],
  })

  console.log(`Total usuarios: ${allUsers.length}\n`)
  console.log('=== Super-admins (isPlatformAdmin = true) ===')
  const superAdmins = allUsers.filter((u) => u.isPlatformAdmin)
  if (superAdmins.length === 0) {
    console.log('  NINGUNO. Hay que crear uno.')
  } else {
    for (const u of superAdmins) {
      console.log(`  - email=${u.email} username=${u.username} name=${u.name} activo=${u.activo}`)
    }
  }

  console.log('\n=== Otros usuarios (sin permisos de plataforma) ===')
  for (const u of allUsers.filter((u) => !u.isPlatformAdmin)) {
    console.log(`  - email=${u.email} username=${u.username} role=${u.role} clinicaId=${u.clinicaId} activo=${u.activo}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
