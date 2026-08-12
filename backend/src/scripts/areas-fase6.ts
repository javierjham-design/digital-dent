// Puesta en producción del módulo de ÁREAS CLÍNICAS (Fase 6) — pasos que NO puede
// hacer `migrate:tenants` solo, en el ORDEN correcto. Dry-run por defecto; --apply.
//
// Por qué existe este script (lección de Caja.numero): Prisma marca "agregar un
// unique sobre una tabla poblada" como data-loss (falso positivo) y migrate-tenants
// corre SIN --accept-data-loss a propósito. El swap del índice de CategoriaPrestacion
// (nombre único global → único por [nombre, area]) se hace acá con SQL explícito y
// aditivo ANTES de migrate:tenants; después el diff de Prisma queda limpio y
// `migrate:tenants -- --strict` aplica el resto (tablas/columnas nuevas) 3/3.
//
// Pasos por clínica (tenant):
//  1. ADD COLUMN area DEFAULT 'DENTAL' (idempotente) — todas las secciones existentes
//     quedan DENTAL.
//  2. DROP del unique global CategoriaPrestacion_nombre_key + CREATE del compuesto
//     CategoriaPrestacion_nombre_area_key (nombres EXACTOS que Prisma espera).
//  3. Backfill Prestacion.categoriaId desde el nombre (hoy sin homónimas → unívoco).
// Paso control-plane:
//  4. Backfill EXPLÍCITO de area_dental en el CSV de módulos de las clínicas que no
//     tienen ningún módulo de área (las 3 productivas). La regla implícita "sin
//     módulo de área ⇒ dental" queda solo como red RUIDOSA (lib/areas.ts).
//     (Clinica.vertical NO se toca acá: la columna nace con el control:push del
//     deploy y su default 'dental' cubre a las existentes.)
//
// ORDEN COMPLETO: backup → este script --apply → migrate:tenants --strict (3/3)
// → deploy (el prestart ya no tiene nada conflictivo que aplicar). Correr este
// script ANTES del deploy: el código nuevo espera las columnas de área.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { MODULOS_AREA_CODES } from '@shared/constants/areas'
import { assertBaseActual, assertControlActual } from '@/lib/db-guard'

const APPLY = process.argv.includes('--apply')

async function main() {
  await assertControlActual(control)
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { id: true, slug: true, dbName: true, modulos: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\n${APPLY ? '=== APLICAR ===' : '=== DRY-RUN (no escribe) ==='}  áreas clínicas — Fase 6 · ${clinicas.length} clínica(s)\n`)

  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    await assertBaseActual(db, c.dbName)
    const cats = await db.$queryRawUnsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM "CategoriaPrestacion"')
    const tieneArea = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'CategoriaPrestacion' AND column_name = 'area'`)
    const sinFk = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "Prestacion" WHERE "categoria" IS NOT NULL`)
    console.log(`━━ ${c.slug} ━━ secciones: ${cats[0]?.n ?? 0} · columna area: ${tieneArea[0]?.n ? 'ya existe' : 'FALTA'} · prestaciones con categoría: ${sinFk[0]?.n ?? 0}`)

    if (APPLY) {
      // 1) columna area (aditiva, default DENTAL)
      await db.$executeRawUnsafe(`ALTER TABLE "CategoriaPrestacion" ADD COLUMN IF NOT EXISTS "area" TEXT NOT NULL DEFAULT 'DENTAL'`)
      // 2) swap del índice único (aditivo/no destructivo; nombres que Prisma espera)
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "CategoriaPrestacion_nombre_key"`)
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CategoriaPrestacion_nombre_area_key" ON "CategoriaPrestacion"("nombre", "area")`)
      // 2.5) Si la clínica nunca abrió Prestaciones, sus secciones no existen como
      // filas (lazy-seed pendiente). Se siembran acá desde las categorías usadas
      // (mismo criterio que listarCategorias), área DENTAL, para que el backfill
      // de la FK cubra a las 3 clínicas y no queden filas legacy por nombre.
      await db.$executeRawUnsafe(
        `INSERT INTO "CategoriaPrestacion" (id, nombre, orden, "noLiquidable", area)
         SELECT gen_random_uuid()::text, x.categoria, (row_number() OVER (ORDER BY x.categoria)) - 1, false, 'DENTAL'
         FROM (SELECT DISTINCT trim("categoria") AS categoria FROM "Prestacion" WHERE "categoria" IS NOT NULL AND trim("categoria") <> '') x
         WHERE NOT EXISTS (SELECT 1 FROM "CategoriaPrestacion")`)
      // 3) categoriaId: columna (por si migrate:tenants aún no corrió) + backfill por nombre
      await db.$executeRawUnsafe(`ALTER TABLE "Prestacion" ADD COLUMN IF NOT EXISTS "categoriaId" TEXT`)
      const filas = await db.$executeRawUnsafe(
        `UPDATE "Prestacion" p SET "categoriaId" = c.id FROM "CategoriaPrestacion" c
         WHERE p."categoriaId" IS NULL AND p."categoria" IS NOT NULL AND p."categoria" = c."nombre"`)
      console.log(`   ✔ índice por área + backfill categoriaId (${filas} fila(s))`)
    }

    // 4) control-plane: módulo de área explícito
    const tieneModuloArea = MODULOS_AREA_CODES.some((code) => (c.modulos ?? '').includes(code))
    if (!tieneModuloArea) {
      console.log(`   módulos: "${c.modulos}" → + area_dental (explícito)`)
      if (APPLY) {
        // select explícito: el RETURNING por defecto pediría Clinica.vertical, que en
        // prod recién existe tras el control:push del deploy (este script corre ANTES).
        await control.clinica.update({ where: { id: c.id }, data: { modulos: `${c.modulos},area_dental` }, select: { id: true } })
        console.log('   ✔ area_dental asignado en el control-plane')
      }
    } else {
      console.log('   módulos: ya tiene un módulo de área — sin cambios')
    }
    await disposeTenant(c.dbName).catch(() => {})
  }
  if (!APPLY) console.log('\n(dry-run — corré con --apply. DESPUÉS: npm run migrate:tenants -- --strict y verificar 3/3.)')
  await control.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
