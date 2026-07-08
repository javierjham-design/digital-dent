// Presencia de usuarios por clínica, EN MEMORIA (para "usuarios en línea" en el
// super-admin). Es efímero: se reinicia con cada redeploy del backend, lo cual es
// correcto — "en línea" es un estado del momento, no un dato histórico. El dato
// persistente (último acceso) vive en control.Clinica.ultimoAccesoAt.

interface Seen { userId: string; name: string; at: number }

const ONLINE_MS = 5 * 60_000   // "en línea" = actividad en los últimos 5 minutos
const PERSIST_MS = 2 * 60_000  // persistir ultimoAccesoAt como mucho cada 2 min por clínica

// clinicaId → (userId → última vez visto)
const porClinica = new Map<string, Map<string, Seen>>()
// clinicaId → timestamp de la última persistencia de ultimoAccesoAt (throttle)
const lastPersist = new Map<string, number>()

// Registra actividad de un usuario de una clínica (lo llama el middleware de tenant).
export function registrarPresencia(clinicaId: string, userId: string, name: string): void {
  let m = porClinica.get(clinicaId)
  if (!m) { m = new Map(); porClinica.set(clinicaId, m) }
  m.set(userId, { userId, name, at: Date.now() })
}

// ¿Corresponde persistir AHORA el ultimoAccesoAt de esta clínica? (evita un
// UPDATE por request; a lo sumo uno cada PERSIST_MS).
export function debePersistirAcceso(clinicaId: string): boolean {
  const now = Date.now()
  if (now - (lastPersist.get(clinicaId) ?? 0) < PERSIST_MS) return false
  lastPersist.set(clinicaId, now)
  return true
}

function vigentes(m: Map<string, Seen> | undefined): Seen[] {
  if (!m) return []
  const cutoff = Date.now() - ONLINE_MS
  const out: Seen[] = []
  for (const s of m.values()) if (s.at >= cutoff) out.push(s)
  return out
}

// Usuarios en línea de una clínica (los vistos en los últimos ONLINE_MS).
export function usuariosEnLinea(clinicaId: string): { userId: string; name: string; at: number }[] {
  return vigentes(porClinica.get(clinicaId)).sort((a, b) => b.at - a.at)
}

// Conteo de usuarios en línea por clínica (para la lista del super-admin).
export function conteoEnLinea(): Map<string, number> {
  const out = new Map<string, number>()
  for (const [clinicaId, m] of porClinica) {
    const n = vigentes(m).length
    if (n > 0) out.set(clinicaId, n)
  }
  return out
}
