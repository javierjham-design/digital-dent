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
