// Regla canónica de solapamiento de intervalos [inicio, fin).
// Dos intervalos se solapan si cada uno empieza antes de que el otro termine.
// Es half-open: [10:00, 10:30) y [10:30, 11:00) NO se solapan (se tocan).
//
// Esta es exactamente la condición que usan tanto la detección de doble
// reserva de citas como el chequeo de bloqueos de agenda (a nivel SQL:
// `inicioA < finB AND finA > inicioB`). Centralizarla evita que ambos lados
// diverjan.
export function intervalsOverlap(aInicio: Date, aFin: Date, bInicio: Date, bFin: Date): boolean {
  return aInicio.getTime() < bFin.getTime() && aFin.getTime() > bInicio.getTime()
}

// Suma `minutos` a una fecha y devuelve una nueva. No muta la original.
export function addMinutes(fecha: Date, minutos: number): Date {
  return new Date(fecha.getTime() + minutos * 60_000)
}
