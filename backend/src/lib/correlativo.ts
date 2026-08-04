import type { Prisma } from '../../prisma/generated/tenant/index.js'

// ── Correlativos concurrentes ────────────────────────────────────────────────
// El `numero` de comprobante de cobro, apertura de caja o presupuesto se calculaba
// con findFirst(desc)+1 FUERA de la transacción: dos operaciones simultáneas en la
// misma clínica (recepción y box cobrando a la vez) leían el mismo máximo y
// chocaban. Como `numero` es @unique, la segunda fallaba con error de constraint y
// para la recepcionista se veía como "el sistema se cayó justo al cobrar".
//
// Solución: generar el número DENTRO de la transacción, serializando con un advisory
// lock transaccional de Postgres (una clave por tipo, para que cobros/sesiones/
// presupuestos no se bloqueen entre sí). El lock se libera solo al cerrar la
// transacción, así que el read del máximo y el create del registro quedan atómicos
// frente a otra transacción concurrente del mismo tipo.
//
// En los tests corremos SQLite, donde pg_advisory_xact_lock no existe: se omite y
// no hace falta, porque SQLite serializa las escrituras (una sola conexión), así
// que el correlativo sigue siendo único.

type TipoCorrelativo = 'cobro' | 'sesionCaja' | 'presupuesto'

// Claves arbitrarias pero estables, una por tipo (evita que tipos distintos se
// serialicen entre sí).
const LOCK_KEY: Record<TipoCorrelativo, number> = { cobro: 840001, sesionCaja: 840002, presupuesto: 840003 }

async function leerMaximo(tx: Prisma.TransactionClient, tipo: TipoCorrelativo): Promise<number> {
  switch (tipo) {
    case 'cobro':
      return (await tx.cobro.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero ?? 0
    case 'sesionCaja':
      return (await tx.sesionCaja.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero ?? 0
    case 'presupuesto':
      return (await tx.presupuesto.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero ?? 0
  }
}

/**
 * Devuelve el siguiente correlativo (máximo + 1) para `tipo`, serializando la
 * generación entre transacciones concurrentes en Postgres.
 *
 * DEBE llamarse DENTRO de una `$transaction`, y el `create` que usa el número tiene
 * que ir en la MISMA transacción (`tx`), para que el lock cubra read + insert.
 */
export async function siguienteNumero(tx: Prisma.TransactionClient, tipo: TipoCorrelativo): Promise<number> {
  // En tests (SQLite) no hay advisory locks; el propio SQLite serializa. En prod
  // (Postgres) el lock transaccional serializa las generaciones concurrentes.
  if (!process.env.VITEST) {
    try {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY[tipo]})`
    } catch {
      // Proveedor sin la función (p. ej. SQLite): se omite.
    }
  }
  return (await leerMaximo(tx, tipo)) + 1
}
