// Alertas por email de los backups. El modo de falla REAL de un sistema de backups
// no es que falle una corrida, es que dejen de correr y nadie se entere: de ahí el
// dead-man's switch. Reusa lib/email.ts (Resend). Destinatarios: BACKUP_ALERT_EMAILS
// o, si no hay, los PlatformAdmin activos.
import { enviarEmail } from '@/lib/email'
import { control } from '@/db/control'
import { env } from '@/config/env'
import { log } from '@/lib/logger'
import { horasDesdeUltimoBackupOk } from '@/lib/backup/status'

async function destinatarios(): Promise<string[]> {
  if (env.backup.alertEmails.length) return env.backup.alertEmails
  const admins = await control.platformAdmin.findMany({ where: { activo: true }, select: { email: true } })
  return admins.map((a) => a.email).filter(Boolean)
}

export async function alertar(asunto: string, cuerpoHtml: string): Promise<void> {
  const to = await destinatarios()
  if (!to.length) { log.warn('backup: alerta sin destinatarios (definí BACKUP_ALERT_EMAILS o creá un PlatformAdmin)'); return }
  for (const email of to) {
    const r = await enviarEmail({ to: email, subject: `[Cláriva backups] ${asunto}`, html: cuerpoHtml })
    if (!r.ok) log.error('backup: no se pudo enviar la alerta', { email, error: r.error })
  }
}

// Dead-man's switch: alerta si pasaron más de maxAgeHours desde la última corrida OK.
// Se llama al inicio de cada corrida (si el cron sigue vivo pero los backups fallan,
// avisa). El fallback si el cron ENTERO se cae es un monitor externo (ver BACKUPS.md).
export async function verificarDeadMan(now = new Date()): Promise<void> {
  const horas = await horasDesdeUltimoBackupOk(now)
  const max = env.backup.maxAgeHours
  if (horas === null) {
    await alertar('Nunca hubo un backup OK', '<p>No existe ninguna corrida de backup con estado OK en el registro. Verificá la configuración del job.</p>')
    return
  }
  if (horas > max) {
    await alertar(
      `Hace ${Math.floor(horas)} h sin un backup OK`,
      `<p>La última corrida de backup exitosa fue hace <strong>${Math.floor(horas)} horas</strong> (umbral: ${max} h). Revisá el servicio de backup en Railway y el bucket.</p>`,
    )
  }
}
