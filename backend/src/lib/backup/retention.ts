// Política de retención GFS (Grandfather-Father-Son) por base, en BANDAS DE EDAD:
//   - Reciente (≤ retainDaily días): se conserva TODO (incluye backups manuales).
//   - Media   (≤ retainWeekly semanas): se conserva el MÁS NUEVO de cada semana ISO.
//   - Vieja   (≤ retainMonthly meses): se conserva el MÁS NUEVO de cada mes.
//   - Más viejo que eso: se borra.
// Lógica PURA (sin S3) para poder testearla. La decisión de borrar la ejecuta el
// script backup:prune, con sus salvaguardas (piso mínimo, credenciales propias).
export interface RetencionParams {
  retainDaily: number
  retainWeekly: number
  retainMonthly: number
}

export interface ObjetoFechado { key: string; date: Date }

// Clave de semana ISO (año-semana) para agrupar.
function claveSemanaIso(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const inicioAnio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const semana = Math.ceil(((t.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`
}

function claveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function menosMeses(now: Date, meses: number): Date {
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d
}

export interface PlanRetencion { conservar: string[]; borrar: string[] }

// Decide qué conservar y qué borrar para el conjunto de dumps de UNA base.
export function planificarRetencion(objs: ObjetoFechado[], now: Date, p: RetencionParams): PlanRetencion {
  const dia = 86400000
  const cutDaily = now.getTime() - p.retainDaily * dia
  const cutWeekly = now.getTime() - p.retainWeekly * 7 * dia
  const cutMonthly = menosMeses(now, p.retainMonthly).getTime()

  // Más nuevo primero: al agrupar por semana/mes, el primero visto es el más nuevo.
  const orden = [...objs].sort((a, b) => b.date.getTime() - a.date.getTime())
  const conservar = new Set<string>()
  const semanasVistas = new Set<string>()
  const mesesVistos = new Set<string>()

  for (const o of orden) {
    const ts = o.date.getTime()
    if (ts >= cutDaily) {
      conservar.add(o.key) // banda reciente: todo
    } else if (ts >= cutWeekly) {
      const k = claveSemanaIso(o.date)
      if (!semanasVistas.has(k)) { semanasVistas.add(k); conservar.add(o.key) }
    } else if (ts >= cutMonthly) {
      const k = claveMes(o.date)
      if (!mesesVistos.has(k)) { mesesVistos.add(k); conservar.add(o.key) }
    }
    // más viejo que cutMonthly → no se conserva
  }

  const borrar = objs.filter((o) => !conservar.has(o.key)).map((o) => o.key)
  return { conservar: [...conservar], borrar }
}

// Salvaguarda: la poda NUNCA debe dejar una base con menos de `minKeep` backups.
// Si el plan dejaría menos, se aborta el borrado de esa base (no se toca nada).
export interface PodaSegura extends PlanRetencion { abortadoPorPiso: boolean }
export function podaConPiso(objs: ObjetoFechado[], now: Date, p: RetencionParams, minKeep: number): PodaSegura {
  const plan = planificarRetencion(objs, now, p)
  if (plan.conservar.length < minKeep) {
    return { conservar: plan.conservar, borrar: [], abortadoPorPiso: true }
  }
  return { ...plan, abortadoPorPiso: false }
}
