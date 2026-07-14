import type { TenantClient } from '@/db/tenant'
import { badRequest } from '@/lib/errors'

// Zona horaria de operación de la clínica (misma que usa el resto del sistema).
const TZ = 'America/Santiago'
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Día de la semana (0=domingo) y minuto del día, en la hora local de la clínica.
function partesLocales(d: Date): { dow: number; min: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const wd = p.find((x) => x.type === 'weekday')?.value ?? 'Sun'
  const hh = Number(p.find((x) => x.type === 'hour')?.value ?? '0') % 24
  const mm = Number(p.find((x) => x.type === 'minute')?.value ?? '0')
  return { dow: DOW[wd] ?? 0, min: hh * 60 + mm }
}

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }

// Tramos de atención (en minutos) de un horario, descontando el receso.
function segmentos(h: { horaInicio: string; horaFin: string; recesoActivo: boolean; recesoInicio: string | null; recesoFin: string | null }): [number, number][] {
  const ini = hm(h.horaInicio), fin = hm(h.horaFin)
  if (h.recesoActivo && h.recesoInicio && h.recesoFin && hm(h.recesoInicio) < hm(h.recesoFin)) {
    return [[ini, hm(h.recesoInicio)], [hm(h.recesoFin), fin]]
  }
  return [[ini, fin]]
}

// Valida que [inicio, fin] caiga COMPLETO dentro del horario de atención del
// profesional ese día (descontando receso). Lanza badRequest si queda fuera.
// Si el profesional no tiene NINGÚN horario configurado, no se restringe (para no
// bloquear clínicas que aún no cargaron sus horarios de atención).
export async function assertDentroDeAtencion(db: TenantClient, doctorId: string, inicio: Date, fin: Date): Promise<void> {
  const total = await db.horarioDoctor.count({ where: { doctorId, activo: true } })
  if (total === 0) return

  const { dow, min: iniMin } = partesLocales(inicio)
  const finParts = partesLocales(fin)
  // Si el fin cae en otro día, queda fuera de todo tramo de atención de este día.
  const finMin = finParts.dow === dow ? finParts.min : 24 * 60

  const h = await db.horarioDoctor.findFirst({
    where: { doctorId, diaSemana: dow, activo: true },
    select: { horaInicio: true, horaFin: true, recesoActivo: true, recesoInicio: true, recesoFin: true },
  })
  if (!h) throw badRequest('El profesional no atiende ese día. Elige un horario dentro de su agenda de atención.')

  const dentro = segmentos(h).some(([s, e]) => iniMin >= s && finMin <= e)
  if (!dentro) {
    throw badRequest('Ese horario está fuera del horario de atención del profesional. Sólo puedes agendar/bloquear dentro de sus bloques de atención.')
  }
}
