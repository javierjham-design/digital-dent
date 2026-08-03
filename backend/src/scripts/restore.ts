// ─────────────────────────────────────────────────────────────────────────────
//  RESTAURACIÓN QUIRÚRGICA POR CLÍNICA (capa 3). Aprovecha database-per-tenant:
//  restaura UNA clínica SIN tocar a las demás y SIN destruir nada.
//
//    npm run restore -- --slug <clinica> --at <ISO8601|latest>   # dry-run (por defecto)
//    npm run restore -- --slug <clinica> --at latest --switch     # hace el corte
//    npm run restore -- --drop-pre-restore --db <base_pre_restore> --apply  # limpieza
//
//  Dry-run: descarga+descifra el dump (verifica sha256 del manifiesto), lo restaura
//  en una base NUEVA clariva_t_<slug>_r<ts>, compara el censo de filas contra el
//  manifiesto (ABORTA si no calza) e imprime un diff restaurado vs. producción.
//  --switch: renombra la base viva a _pre_restore_<ts> (se CONSERVA), apunta la
//  clínica a la base restaurada e invalida el cliente cacheado. Rollback = volver a
//  apuntar dbName. Ver docs/BACKUPS.md.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { invalidateClinicaCache } from '@/middlewares/tenant'
import { dropEphemeralDatabase, dropTenantDatabase, renameTenantDatabase, assertValidDbName } from '@/lib/provision'
import { restaurarDumpABase } from '@/lib/backup/restore-core'
import { encontrarBackup } from '@/lib/backup/locate'
import { censusEnServidorTenant, compararCenso, TABLAS_CENSO_TENANT } from '@/lib/backup/census'
import { backupBaseAPreDrop } from '@/lib/backup/runner'
import { log } from '@/lib/logger'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (f: string) => process.argv.includes(f)

// Nombre efímero que respeta el tope de 63 chars de Postgres (trunca el slug base).
function nombreEfimero(base: string, sufijo: string): string {
  const name = `${base.slice(0, 63 - sufijo.length)}${sufijo}`
  assertValidDbName(name)
  return name
}

async function montoCobros(dbName: string): Promise<number> {
  const rows = await tenantClient(dbName).$queryRawUnsafe<{ s: number }[]>('SELECT coalesce(sum(monto),0)::float AS s FROM "Cobro"')
  return rows[0]?.s ?? 0
}

async function restaurarClinica(): Promise<void> {
  const slug = arg('--slug')
  const at = arg('--at') ?? 'latest'
  const doSwitch = has('--switch')
  if (!slug) throw new Error('Falta --slug <clinica>.')

  const clinica = await control.clinica.findUnique({ where: { slug }, select: { id: true, slug: true, dbName: true } })
  if (!clinica) throw new Error(`No existe una clínica con slug "${slug}" en el control-plane.`)

  const found = await encontrarBackup(slug, at)
  if (!found) throw new Error(`No se encontró un backup OK para "${slug}" (--at ${at}).`)
  log.info('restore: backup elegido', { slug, manifiesto: found.manifestKey, iso: found.manifest.iso, key: found.entrada.key })

  const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 12) // YYYYMMDDHHmm
  const tempDb = nombreEfimero(clinica.dbName, `_r${ts}`)

  // 1-3) Restaurar a base temporal, verificar sha256 y censo contra el manifiesto.
  await restaurarDumpABase(found.entrada.key!, found.entrada.sha256!, tempDb)
  const restaurado = await censusEnServidorTenant(tempDb, TABLAS_CENSO_TENANT)
  const cmp = compararCenso(found.entrada.censo, restaurado)
  if (!cmp.ok) {
    await dropEphemeralDatabase(tempDb).catch(() => {})
    console.table(cmp.filas)
    throw new Error('Censo restaurado NO coincide con el manifiesto. Se abortó y se descartó la base temporal.')
  }

  // 4) Diff legible: qué se recuperaría vs. lo que hay HOY en producción.
  const hoy = await censusEnServidorTenant(clinica.dbName, TABLAS_CENSO_TENANT)
  const montoRest = await montoCobros(tempDb)
  const montoHoy = await montoCobros(clinica.dbName)
  console.log(`\n=== Restauración de "${slug}" (backup del ${found.manifest.iso}) ===`)
  console.table(TABLAS_CENSO_TENANT.map((t) => ({ tabla: t, produccion_hoy: hoy[t] ?? 0, se_restauraria: restaurado[t] ?? 0 })))
  console.log(`Monto total en Cobro:  hoy=$${Math.round(montoHoy).toLocaleString('es-CL')}  ·  restaurado=$${Math.round(montoRest).toLocaleString('es-CL')}`)
  console.log(`Base temporal restaurada: ${tempDb}`)

  if (!doSwitch) {
    if (!has('--keep-temp')) await dropEphemeralDatabase(tempDb).catch(() => {})
    console.log(`\nDRY-RUN: no se cambió NADA en producción. Reejecutá con --switch para hacer el corte.${has('--keep-temp') ? ` (base temporal conservada: ${tempDb})` : ''}`)
    return
  }

  // 5) Corte: la base viva se CONSERVA renombrada (rollback = repuntar dbName).
  const preRestore = nombreEfimero(clinica.dbName, `_prev${ts}`)
  await renameTenantDatabase(clinica.dbName, preRestore)
  await control.clinica.update({ where: { id: clinica.id }, data: { dbName: tempDb } })
  await disposeTenant(clinica.dbName)
  invalidateClinicaCache(clinica.id)
  console.log(`\n✔ SWITCH hecho. La clínica "${slug}" ahora apunta a ${tempDb}.`)
  console.log(`  Base anterior CONSERVADA como: ${preRestore}`)
  console.log(`  ROLLBACK: npm run restore -- (repuntar) o SQL: UPDATE "Clinica" SET "dbName"='${preRestore}' WHERE slug='${slug}';  y disposeTenant.`)
  console.log(`  Limpieza definitiva (irreversible, más tarde): npm run restore -- --drop-pre-restore --db ${preRestore} --apply`)
}

// Limpieza de una base _pre_restore_ (datos viejos). Hace un pre-drop antes de
// borrar (la barrera de dropTenantDatabase lo exige). Nunca automático.
async function dropPreRestore(): Promise<void> {
  const db = arg('--db')
  if (!db) throw new Error('Falta --db <base_pre_restore>.')
  if (!has('--apply')) throw new Error('Es irreversible: agregá --apply para confirmar.')
  assertValidDbName(db)
  log.info('restore: pre-drop de seguridad antes de borrar', { db })
  const entry = await backupBaseAPreDrop(db)
  if (!entry.ok) throw new Error(`No se pudo hacer el pre-drop de ${db}: ${entry.error}. No se borra nada.`)
  await dropTenantDatabase(db, { confirmarBorradoProductivo: true })
  console.log(`✔ ${db} borrada (con pre-drop en ${entry.key}).`)
}

const main = has('--drop-pre-restore') ? dropPreRestore : restaurarClinica
main()
  .then(() => process.exit(0))
  .catch((e) => { log.error('restore: falló', { err: e instanceof Error ? e.message : String(e) }); process.exit(1) })
