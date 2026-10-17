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

// Lock transaccional genérico por CLAVE (string). DEBE llamarse DENTRO de una $transaction;
// la lectura/validación + el write deben ir en la MISMA tx para que el lock los cubra.
// Sirve para serializar reservas de agenda, finalización de liquidaciones, apertura de caja, etc.
export async function advisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  if (process.env.VITEST) return
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hashInt32(key)})`
  } catch {
    // Proveedor sin la función (p. ej. SQLite): se omite.
  }
}

// Serializa por PROFESIONAL (anti doble reserva de cita).
export function lockAgendaDoctor(tx: Prisma.TransactionClient, doctorId: string): Promise<void> {
  return advisoryLock(tx, `agenda:${doctorId}`)
}
