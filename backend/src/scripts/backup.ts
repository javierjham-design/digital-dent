// ─────────────────────────────────────────────────────────────────────────────
//  Job de BACKUP diario (capa 2): dump lógico por base, cifrado y fuera de Railway.
//  Se ejecuta como servicio cron propio en Railway (npm run backup), NO dentro del
//  proceso de la API. Descubre las bases desde el control-plane.
//
//    npm run backup                 # todas las clínicas (excluye demos) + control
//    npm run backup -- --incluir-demos
//
//  Requiere: BACKUP_ENCRYPTION_KEY + BACKUP_S3_* (ver docs/BACKUPS.md).
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { ejecutarBackup } from '@/lib/backup/runner'
import { log } from '@/lib/logger'

const incluirDemos = process.argv.includes('--incluir-demos')

ejecutarBackup({ incluirDemos, disparadoPor: 'cron' })
  .then((r) => {
    log.info('backup: fin', { ...r })
    // PARCIAL/ERROR → exit code 1 para que Railway/monitor lo note.
    process.exit(r.estado === 'OK' ? 0 : 1)
  })
  .catch((e) => {
    log.error('backup: abortó', { err: e instanceof Error ? e.message : String(e) })
    process.exit(1)
  })
