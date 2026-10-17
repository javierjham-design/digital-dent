import type { Prisma } from '../../prisma/generated/tenant/index.js'

// ── Lock de agenda (anti doble reserva) ──────────────────────────────────────
// La validación de solape (findSolapada) + el create de la cita se hacían FUERA de
// una transacción: dos reservas simultáneas del mismo profesional (tráfico de campaña
// al link público, o recepción + webhook) pasaban ambas la validación y ambas creaban
// → DOBLE RESERVA. Igual que los correlativos, se serializa con un advisory lock
// transaccional de Postgres, aquí por PROFESIONAL (clave = hash del doctorId): la
// validación + el create quedan atómicos frente a otra reserva del mismo doctor.
// La contención es nula (un doctor no recibe decenas de reservas en el mismo instante).
//
// En tests (SQLite) pg_advisory_xact_lock no existe: se omite y no hace falta, porque
// SQLite serializa las escrituras (una sola conexión).

// Hash estable de un string a int32 (determinista, sin dependencias). Sirve de clave
// para el advisory lock (pg_advisory_xact_lock acepta el entero como bigint).
function hashInt32(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

// Serializa por PROFESIONAL. DEBE llamarse DENTRO de una $transaction, y la validación
// de solape + el create/update de la cita deben ir en la MISMA transacción (tx).
export async function lockAgendaDoctor(tx: Prisma.TransactionClient, doctorId: string): Promise<void> {
  if (process.env.VITEST) return
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hashInt32(`agenda:${doctorId}`)})`
  } catch {
    // Proveedor sin la función (p. ej. SQLite): se omite.
  }
}
