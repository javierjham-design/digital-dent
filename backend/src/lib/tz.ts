// Utilidades de zona horaria para el agendamiento online. La clínica opera en
// hora de Chile (America/Santiago, con horario de verano). El servidor corre en
// UTC, así que para generar/validar los slots convertimos "hora de pared" (HH:MM
// de un día) a un instante UTC y viceversa, usando Intl (respeta el DST).

export const CLINIC_TZ = 'America/Santiago'

// Minutos que la zona está adelantada respecto de UTC en un instante dado.
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value
  const h = m.hour === '24' ? 0 : Number(m.hour)
  const asTz = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), h, Number(m.minute), Number(m.second))
  return (asTz - date.getTime()) / 60000
}

// "2026-07-15" + "15:00" (hora de pared en la tz) → Date UTC del instante.
export function wallClockToUtc(ymd: string, hm: string, tz = CLINIC_TZ): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  const offset = tzOffsetMinutes(new Date(asUtc), tz)
  return new Date(asUtc - offset * 60000)
}

// Fecha civil (YYYY-MM-DD) de "hoy" en la tz.
export function todayYmd(tz = CLINIC_TZ, now = new Date()): string {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return dtf.format(now) // en-CA da YYYY-MM-DD
}

// YYYY-MM-DD + n días → YYYY-MM-DD (aritmética de calendario, sin tz).
export function addDaysYmd(ymd: string, n: number): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// Día de la semana (0=domingo … 6=sábado) de una fecha civil.
export function weekdayOfYmd(ymd: string): number {
  const [y, mo, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

export const toMin = (hm: string): number => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
export const fromMin = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
