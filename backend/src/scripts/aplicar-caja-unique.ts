// Aplica los índices únicos de Caja.numero y SesionCaja.numero a TODAS las bases de
// clínica. `prisma db push` rechaza agregar @unique a una columna poblada sin
// --accept-data-loss (falso positivo: avisa por si hubiera duplicados), y migrate-tenants
// nunca usa ese flag (regla 1). Un `CREATE UNIQUE INDEX` explícito es aditivo y no
// destructivo: en el peor caso falla sin tocar una fila. Los nombres son EXACTAMENTE los
// que Prisma espera (`<Model>_<campo>_key`) para que luego `migrate diff` dé vacío.
//
// TODO-O-NADA: se pre-chequean duplicados en las 3 ANTES de crear nada; si algo falla a
// mitad, se hace rollback (DROP INDEX) en todas para no dejar el schema disparejo.
//
// Uso:
//   tsx src/scripts/aplicar-caja-unique.ts           → pre-chequeo (dups + si el índice ya existe).
//   tsx src/scripts/aplicar-caja-unique.ts --apply    → aplica (con rollback si algo falla).
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'

const APPLY = process.argv.includes('--apply')

const INDICES = [
  { nombre: 'Caja_numero_key', tabla: 'Caja' },
  { nombre: 'SesionCaja_numero_key', tabla: 'SesionCaja' },
] as const

async function duplicados(dbName: string, tabla: string): Promise<number> {
  const db = tenantClient(dbName)
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM (SELECT "numero" FROM "${tabla}" GROUP BY "numero" HAVING count(*) > 1) d`,
  )
  return rows[0]?.n ?? 0
}

async function indiceExiste(dbName: string, nombre: string): Promise<boolean> {
  const db = tenantClient(dbName)
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = '${nombre}'`,
  )
  return (rows[0]?.n ?? 0) > 0
}

async function dropIndices(dbName: string): Promise<void> {
  const db = tenantClient(dbName)
  for (const i of INDICES) await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${i.nombre}"`)
}

async function main() {
  const ahora = new Date()
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }, { demoExpiraEn: { gt: ahora } }] },
    select: { slug: true, dbName: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\n${APPLY ? 'APLICAR' : 'PRE-CHEQUEO'} índices únicos Caja/SesionCaja — ${clinicas.length} base(s)\n`)

  // ── Fase 1: pre-chequeo de duplicados en TODAS (antes de crear nada) ──
  let hayDups = false
  for (const c of clinicas) {
    const dupCaja = await duplicados(c.dbName, 'Caja')
    const dupSesion = await duplicados(c.dbName, 'SesionCaja')
    const yaCaja = await indiceExiste(c.dbName, 'Caja_numero_key')
    const yaSesion = await indiceExiste(c.dbName, 'SesionCaja_numero_key')
    if (dupCaja > 0 || dupSesion > 0) hayDups = true
    console.log(`  ${c.slug.padEnd(22)} dups Caja=${dupCaja} Sesion=${dupSesion} · índice ya existe: Caja=${yaCaja} Sesion=${yaSesion}`)
  }
  if (hayDups) {
    console.error('\n⛔ Hay duplicados en al menos una base. NO se crea ningún índice. Resolvé los duplicados primero.')
    await control.$disconnect(); process.exit(1)
  }
  console.log('\n✓ Sin duplicados en ninguna base.')

  if (!APPLY) {
    console.log('(pre-chequeo únicamente; corré con --apply para crear los índices)')
    await control.$disconnect(); process.exit(0)
  }

  // ── Fase 2: aplicar (con rollback global si algo falla) ──
  const aplicadas: string[] = []
  try {
    for (const c of clinicas) {
      const db = tenantClient(c.dbName)
      for (const i of INDICES) {
        await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "${i.nombre}" ON "${i.tabla}"("numero")`)
      }
      aplicadas.push(c.slug)
      console.log(`  · ${c.slug} … OK`)
    }
  } catch (e) {
    console.error(`\n⛔ FALLÓ en la base #${aplicadas.length + 1}: ${e instanceof Error ? e.message : String(e)}`)
    console.error('   Haciendo ROLLBACK (DROP INDEX) en TODAS las bases para no dejar el schema disparejo…')
    for (const c of clinicas) {
      try { await dropIndices(c.dbName) } catch (e2) { console.error(`   ⚠️ no pude revertir ${c.slug}: ${e2 instanceof Error ? e2.message : e2}`) }
    }
    console.error('   Rollback hecho. Ninguna base quedó con el índice. PARÁ y revisá.')
    await control.$disconnect(); process.exit(1)
  }

  // ── Fase 3: verificar que las 3 quedaron con AMBOS índices ──
  let todasOk = true
  for (const c of clinicas) {
    const okCaja = await indiceExiste(c.dbName, 'Caja_numero_key')
    const okSesion = await indiceExiste(c.dbName, 'SesionCaja_numero_key')
    if (!okCaja || !okSesion) todasOk = false
    console.log(`  verif ${c.slug.padEnd(22)} Caja=${okCaja} Sesion=${okSesion}`)
    await disposeTenant(c.dbName).catch(() => {})
  }
  console.log(todasOk ? `\n✅ Índices aplicados en las ${clinicas.length} bases.` : '\n⛔ Alguna base quedó sin ambos índices — revisá.')
  await control.$disconnect()
  process.exit(todasOk ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
