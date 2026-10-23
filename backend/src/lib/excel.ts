import * as XLSX from 'xlsx'

// Helpers de exportación a Excel (portados del monolito, sin la parte Next).
// El controller arma la respuesta HTTP con el buffer que devuelve buildXlsx.

export function formatRUT(rut: string | null | undefined): string {
  if (!rut) return ''
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return clean
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

// isoDate/isoDateTime cortan el ISO en UTC: SOLO para campos "fecha-sola" guardados a
// medianoche UTC (fechaCompletado, fechaPago retro legacy, fechaNacimiento). Para un
// INSTANTE real (cita.fecha, createdAt, movimiento.fecha) usá las variantes *Tz: en UTC
// una cita de las 21:00 de Chile salía con hora corrida +3/4 h y FECHA del día siguiente.
export function isoDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function isoDateTime(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

// Partes de un instante en una zona horaria dada (es-CL con en-CA da YYYY-MM-DD).
function partesTz(date: Date, tz: string): { ymd: string; hm: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` }
}

export function isoDateTz(d: Date | string | null | undefined, tz: string): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  return partesTz(date, tz).ymd
}

export function isoDateTimeTz(d: Date | string | null | undefined, tz: string): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  const { ymd, hm } = partesTz(date, tz)
  return `${ymd} ${hm}`
}

export function clp(n: number | null | undefined): number {
  if (n == null) return 0
  return Math.round(n)
}

export type ExcelColumn<T> = {
  header: string
  width?: number
  value: (row: T) => string | number | null | undefined
}

export function buildXlsx<T>(rows: T[], columns: ExcelColumn<T>[], sheetName: string): Buffer {
  const data = rows.map((r) => {
    const obj: Record<string, string | number> = {}
    for (const c of columns) {
      const v = c.value(r)
      obj[c.header] = v == null ? '' : v
    }
    return obj
  })
  const sheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) })
  sheet['!cols'] = columns.map((c) => ({ wch: c.width ?? 16 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31))
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function parseDateRange(from?: string, to?: string): { desde: Date | null; hasta: Date | null } {
  let desde: Date | null = null
  let hasta: Date | null = null
  if (from) {
    desde = new Date(from + 'T00:00:00')
    if (isNaN(desde.getTime())) desde = null
  }
  if (to) {
    hasta = new Date(to + 'T23:59:59.999')
    if (isNaN(hasta.getTime())) hasta = null
  }
  return { desde, hasta }
}
