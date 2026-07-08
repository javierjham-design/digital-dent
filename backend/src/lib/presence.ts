// Presencia de usuarios por clínica, EN MEMORIA (para "usuarios en línea" en el
// super-admin). Es efímero: se reinicia con cada redeploy del backend, lo cual es
// correcto — "en línea" es un estado del momento, no un dato histórico. El dato
// persistente (último acceso) vive en control.Clinica.ultimoAccesoAt.

interface Seen { userId: string; name: string; admin: boolean; at: number }

const ONLINE_MS = 5 * 60_000   // "en línea" = actividad en los últimos 5 minutos
const PERSIST_MS = 2 * 60_000  // persistir el último acceso como mucho cada 2 min por scope

// clinicaId → (userId → última vez visto)
const porClinica = new Map<string, Map<string, Seen>>()
// scope ("<clinicaId>" o "<clinicaId>:admin") → timestamp de la última persistencia (throttle)
const lastPersist = new Map<string, number>()

// Registra actividad de un usuario de una clínica (lo llama el middleware de tenant).
export function registrarPresencia(clinicaId: string, userId: string, name: string, admin: boolean): void {
  let m = porClinica.get(clinicaId)
  if (!m) { m = new Map(); porClinica.set(clinicaId, m) }
  m.set(userId, { userId, name, admin, at: Date.now() })
}

// ¿Corresponde persistir AHORA el último acceso de este scope? (evita un UPDATE por
// request; a lo sumo uno cada PERSIST_MS). scope: clinicaId, o `${clinicaId}:admin`.
export function debePersistirAcceso(scope: string): boolean {
  const now = Date.now()
  if (now - (lastPersist.get(scope) ?? 0) < PERSIST_MS) return false
  lastPersist.set(scope, now)
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
export function usuariosEnLinea(clinicaId: string): { userId: string; name: string; admin: boolean; at: number }[] {
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

// Total de usuarios en línea en TODA la plataforma (KPI del super-admin).
export function totalEnLinea(): number {
  let total = 0
  for (const m of porClinica.values()) total += vigentes(m).length
  return total
}
