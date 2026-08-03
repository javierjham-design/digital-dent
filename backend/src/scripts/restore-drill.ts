// ─────────────────────────────────────────────────────────────────────────────
//  ENSAYO DE RESTAURACIÓN semanal. Un backup que nunca se restauró no es un backup.
//  Restaura la base de CONTROL y la clínica MÁS CHICA a bases efímeras, valida el
//  censo de filas contra el manifiesto, y las borra. Si algo falla, ALERTA por email.
//
//    npm run backup:drill
//
//  Se ejecuta como servicio cron propio en Railway (semanal). Ver docs/BACKUPS.md.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { control } from '@/db/control'
import { assertValidDbName, dropEphemeralDatabase } from '@/lib/provision'
import { restaurarDumpABase } from '@/lib/backup/restore-core'
import { encontrarBackup } from '@/lib/backup/locate'
import { censusEnServidorTenant, compararCenso, TABLAS_CENSO_TENANT } from '@/lib/backup/census'
import { alertar } from '@/lib/backup/alerts'
import { log } from '@/lib/logger'

const sufijoDrill = () => `_drill_${randomBytes(4).toString('hex')}`

function nombreEfimero(base: string, sufijo: string): string {
  const name = `${base.slice(0, 63 - sufijo.length)}${sufijo}`
  assertValidDbName(name)
  return name
}

// Ensaya una base: restaura → compara censo → borra. Devuelve null si OK, o el motivo.
async function ensayar(ref: string, tablas: readonly string[]): Promise<string | null> {
  const found = await encontrarBackup(ref, 'latest')
  if (!found) return `no hay backup OK para "${ref}"`
  const tempDb = nombreEfimero(found.entrada.dbName, sufijoDrill())
  try {
    await restaurarDumpABase(found.entrada.key!, found.entrada.sha256!, tempDb)
    const censo = await censusEnServidorTenant(tempDb, tablas)
    const cmp = compararCenso(found.entrada.censo, censo)
    if (!cmp.ok) return `censo no coincide en "${ref}": ${JSON.stringify(cmp.filas.filter((f) => !f.ok))}`
    log.info('drill: ensayo OK', { ref, tempDb, censo })
    return null
  } finally {
    await dropEphemeralDatabase(tempDb).catch((e) => log.warn('drill: no se pudo borrar la base efímera', { tempDb, err: String(e) }))
  }
}

async function clinicaMasChica(): Promise<string | null> {
  const clinicas = await control.clinica.findMany({ where: { esDemo: false, activo: true }, select: { slug: true, dbName: true } })
  let min: { slug: string; n: number } | null = null
  for (const c of clinicas) {
    const censo = await censusEnServidorTenant(c.dbName, ['Paciente']).catch(() => ({ Paciente: Number.MAX_SAFE_INTEGER }))
    const n = censo.Paciente ?? 0
    if (!min || n < min.n) min = { slug: c.slug, n }
  }
  return min?.slug ?? null
}

async function main(): Promise<void> {
  const problemas: string[] = []

  const control0 = await ensayar('control', ['Clinica'])
  if (control0) problemas.push(`control: ${control0}`)

  const slug = await clinicaMasChica()
  if (!slug) problemas.push('no hay clínicas activas para ensayar')
  else {
    const r = await ensayar(slug, TABLAS_CENSO_TENANT)
    if (r) problemas.push(r)
  }

  if (problemas.length) {
    log.error('drill: ENSAYO FALLÓ', { problemas })
    await alertar('Ensayo de restauración FALLÓ', `<p>El ensayo semanal de restauración falló:</p><ul>${problemas.map((p) => `<li>${p}</li>`).join('')}</ul><p>Un backup que no se puede restaurar no sirve. Revisá docs/BACKUPS.md.</p>`).catch(() => {})
    process.exit(1)
  }
  log.info('drill: ensayo semanal OK (control + clínica más chica restauradas y verificadas)')
}

main().catch(async (e) => {
  log.error('drill: abortó', { err: e instanceof Error ? e.message : String(e) })
  await alertar('Ensayo de restauración abortó', `<p>${e instanceof Error ? e.message : String(e)}</p>`).catch(() => {})
  process.exit(1)
})
