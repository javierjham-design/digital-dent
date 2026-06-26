// Mantenimiento que se ejecuta al arrancar el backend (best-effort, no bloquea
// el arranque). Garantiza que las prestaciones duplicadas se fusionen en CADA
// deploy, sin depender de que nadie apriete un botón. Es idempotente: si no hay
// duplicados no hace nada.
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { dedupePrestaciones } from '@/services/catalogo.service'

export async function dedupePrestacionesTodasLasClinicas(): Promise<void> {
  try {
    const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true } })
    let totalEliminadas = 0
    for (const c of clinicas) {
      try {
        const r = await dedupePrestaciones(tenantClient(c.dbName))
        if (r.eliminadas > 0) {
          totalEliminadas += r.eliminadas
          console.log(`[mantenimiento] ${c.slug}: ${r.eliminadas} prestación(es) duplicada(s) fusionada(s) (${r.restantes} quedan)`)
        }
      } catch (e) {
        console.error(`[mantenimiento] ${c.slug}: error al deduplicar prestaciones —`, e instanceof Error ? e.message : e)
      }
    }
    console.log(totalEliminadas === 0
      ? '[mantenimiento] prestaciones: sin duplicados en ninguna clínica'
      : `[mantenimiento] prestaciones: ${totalEliminadas} duplicada(s) eliminada(s) en total`)
  } catch (e) {
    console.error('[mantenimiento] no se pudo deduplicar prestaciones —', e instanceof Error ? e.message : e)
  }
}
