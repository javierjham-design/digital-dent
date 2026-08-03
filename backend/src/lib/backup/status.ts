// Estado de las corridas de backup (tabla BackupRun del control-plane). Lo usan el
// dead-man's switch (alertar si pasaron demasiadas horas sin una corrida OK) y el
// guard de migrate-tenants (abortar si el último backup OK tiene más de 24 h).
import { control } from '@/db/control'

export async function ultimaCorridaOk(): Promise<{ at: Date } | null> {
  const r = await control.backupRun.findFirst({
    where: { estado: 'OK' },
    orderBy: { iniciadoAt: 'desc' },
    select: { terminadoAt: true, iniciadoAt: true },
  })
  if (!r) return null
  return { at: r.terminadoAt ?? r.iniciadoAt }
}

export async function horasDesdeUltimoBackupOk(now = new Date()): Promise<number | null> {
  const u = await ultimaCorridaOk()
  if (!u) return null
  return (now.getTime() - u.at.getTime()) / 3_600_000
}
