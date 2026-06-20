// Verificación post-migración: confirma que cada clínica registrada en el
// control-plane tiene su base física propia con sus datos (aislamiento real).
// Uso: setear CONTROL_DATABASE_URL + TENANT_DB_SERVER_URL y `tsx src/scripts/verify-migration.ts`.
import 'dotenv/config'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'

async function main() {
  const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true } })
  console.log(`\nControl-plane: ${clinicas.length} clínica(s)\n`)
  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    const [pacientes, users, prestaciones, citas, cobros, conf] = await Promise.all([
      db.paciente.count(),
      db.user.count(),
      db.prestacion.count(),
      db.cita.count(),
      db.cobro.count(),
      db.configuracion.findUnique({ where: { id: 'singleton' }, select: { nombre: true, waEnabled: true, googleRefreshToken: true } }),
    ])
    console.log(`• ${c.slug}  (${c.dbName})`)
    console.log(`    nombre="${conf?.nombre}"  pacientes=${pacientes}  equipo=${users}  prestaciones=${prestaciones}  citas=${citas}  cobros=${cobros}`)
    console.log(`    whatsapp=${conf?.waEnabled ? 'ON' : 'off'}  google=${conf?.googleRefreshToken ? 'conectado' : 'no'}`)
  }
  console.log('')
}

main()
  .catch((e) => { console.error('✖', e); process.exitCode = 1 })
  .finally(() => control.$disconnect())
