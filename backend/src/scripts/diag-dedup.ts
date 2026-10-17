export {} // módulo (evita colisión de `main` global con otros scripts de diagnóstico)
// DIAGNÓSTICO SOLO-LECTURA previo a las restricciones de BD de la Ola 4. No escribe nada.
// Verifica que NO haya duplicados que harían fallar los índices únicos:
//   - control.Clinica.metaPageId duplicado (H10: su índice único corre en prestart → outage si falla)
//   - LiquidacionItem.tratamientoId duplicado por tenant (H9)
//   - SesionCaja (cajaId) con >1 ABIERTA por tenant (M12: informativo)
// Uso (contra prod): railway run -s Postgres -- npx tsx src/scripts/diag-dedup.ts

if (process.env.DATABASE_PUBLIC_URL) {
  const base = process.env.DATABASE_PUBLIC_URL
  process.env.TENANT_DB_SERVER_URL = base
  const u = new URL(base); u.pathname = '/clariva_control'
  process.env.CONTROL_DATABASE_URL = u.toString()
}

async function main() {
  const { control } = await import('@/db/control')
  const { tenantClient } = await import('@/db/tenant')

  const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true, metaPageId: true, activo: true, esDemo: true } })
  console.log(`\n=== ${clinicas.length} clínica(s) en el control ===`)

  // H10: metaPageId duplicado entre clínicas (NO null).
  const porPage = new Map<string, string[]>()
  for (const c of clinicas) if (c.metaPageId) porPage.set(c.metaPageId, [...(porPage.get(c.metaPageId) ?? []), c.slug])
  const dupPages = [...porPage.entries()].filter(([, v]) => v.length > 1)
  console.log('\n-- H10 metaPageId duplicado --')
  console.log(dupPages.length === 0 ? '  OK: ningún page_id compartido → @unique seguro' : `  ⚠ DUPLICADOS: ${dupPages.map(([p, v]) => `${p}→[${v.join(',')}]`).join(' · ')}`)

  // Por tenant: H9 (LiquidacionItem.tratamientoId) + M12 (SesionCaja ABIERTA por caja).
  console.log('\n-- H9 LiquidacionItem.tratamientoId duplicado + M12 doble ABIERTA (por tenant) --')
  let h9Total = 0, m12Total = 0
  for (const c of clinicas) {
    try {
      const db = tenantClient(c.dbName)
      const liq = await db.$queryRawUnsafe<{ tratamientoId: string; n: bigint }[]>('SELECT "tratamientoId", count(*) as n FROM "LiquidacionItem" GROUP BY "tratamientoId" HAVING count(*) > 1')
      const ses = await db.$queryRawUnsafe<{ cajaId: string; n: bigint }[]>(`SELECT "cajaId", count(*) as n FROM "SesionCaja" WHERE estado = 'ABIERTA' GROUP BY "cajaId" HAVING count(*) > 1`)
      h9Total += liq.length; m12Total += ses.length
      if (liq.length || ses.length) console.log(`  ⚠ ${c.slug}: H9 dup=${liq.length} · M12 dobleAbierta=${ses.length}`)
    } catch (e) {
      console.log(`  (saltado ${c.slug}: ${e instanceof Error ? e.message.slice(0, 60) : e})`)
    }
  }
  console.log(`  H9 total duplicados: ${h9Total} ${h9Total === 0 ? '(OK)' : '(⚠ resolver antes del @@unique)'}`)
  console.log(`  M12 total doble-ABIERTA: ${m12Total} ${m12Total === 0 ? '(OK)' : '(⚠ cerrar una antes)'}`)
  console.log('')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
