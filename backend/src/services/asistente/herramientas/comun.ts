import { z } from 'zod'
import { rangoFechasUtc } from '@/lib/tz'

// Fecha civil YYYY-MM-DD (hora de la clínica). Las herramientas con rango la exigen.
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD')

// Rango [gte, lte] en UTC a partir de desde/hasta en hora de la clínica.
export function rangoUtc(desde: string, hasta: string, tz: string): { gte?: Date; lte?: Date } {
  return rangoFechasUtc(desde, hasta, tz)
}

// Edad en años a partir de la fecha de nacimiento (sin exponer la fecha exacta).
export function edadEnAnios(fechaNacimiento: Date | null | undefined): number | null {
  if (!fechaNacimiento) return null
  const ahora = new Date()
  let edad = ahora.getUTCFullYear() - fechaNacimiento.getUTCFullYear()
  const m = ahora.getUTCMonth() - fechaNacimiento.getUTCMonth()
  if (m < 0 || (m === 0 && ahora.getUTCDate() < fechaNacimiento.getUTCDate())) edad -= 1
  return edad >= 0 && edad < 130 ? edad : null
}

// Resta n meses a "ahora" (para cortes de inactividad).
export function haceMeses(n: number): Date {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - n)
  return d
}
