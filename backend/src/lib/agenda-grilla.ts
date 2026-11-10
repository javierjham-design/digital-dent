// Granularidad de la grilla de la agenda. La clínica trabaja en bloques de 15 min,
// así que las horas se ofrecen alineadas a :00/:15/:30/:45 INDEPENDIENTE de cuánto
// dure la cita. Antes el paso de la grilla era == la duración: para que aparecieran
// los huecos de :15/:45 había que fijar la duración en 15, pero entonces la cita
// reservaba solo 15 min aunque la consulta durara 20 y dos citas pegadas se pisaban.
// Desacoplar el PASO (bloque de 15) del LARGO (duración real) arregla ambos: se ven
// los huecos reales Y cada cita bloquea su duración completa, sin traslapes.
export const GRID_MIN = 15

// Minutos de inicio candidatos dentro de una ventana [wStart, wEnd) (todo en minutos
// desde medianoche): avanza en pasos de la grilla —nunca más grueso que el bloque,
// nunca más fino que la propia cita— y cada candidato ocupa `durationMin`. La
// validación de solape contra la ocupación (que descarta los que pisan una cita) la
// hace el llamador; acá solo se generan los inicios candidatos.
export function pasosDeGrilla(wStart: number, wEnd: number, durationMin: number, gridMin = GRID_MIN): number[] {
  if (!(durationMin > 0) || wEnd <= wStart) return []
  const step = Math.max(1, Math.min(durationMin, gridMin))
  const out: number[] = []
  for (let m = wStart; m + durationMin <= wEnd; m += step) out.push(m)
  return out
}

// Ajusta una duración al múltiplo de la grilla (15 min) REDONDEANDO HACIA ARRIBA, con
// mínimo un bloque. La clínica trabaja en bloques de 15 y su panel NO deja crear una
// cita de 20; pero un consumidor del contrato (TuBot) podía mandar una duración fuera de
// grilla (20, 50…) —sea por `end−start`, por un servicio mal configurado, o al REAGENDAR
// conservando la duración de una cita vieja ya torcida— y quedaba una cita que termina en
// :35 y pisa media celda de la grilla. Redondear hacia arriba nunca sub-reserva (jamás deja
// una cita MÁS corta de lo pedido) y garantiza que toda cita del bot caiga en la grilla:
// 15→15, 20→30, 30→30, 45→45, 50→60, 0/negativo→15.
export function snapGrid(durationMin: number, gridMin = GRID_MIN): number {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return gridMin
  return Math.max(gridMin, Math.ceil(durationMin / gridMin) * gridMin)
}
