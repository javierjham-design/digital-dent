import * as XLSX from 'xlsx'
import { NextResponse } from 'next/server'

export function formatRUT(rut: string | null | undefined): string {
  if (!rut) return ''
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return clean
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

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

export function clp(n: number | null | undefined): number {
  if (n == null) return 0
  return Math.round(n)
}

export type ExcelColumn<T> = {
  header: string
  width?: number
  value: (row: T) => string | number | null | undefined
}

export function buildXlsx<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  sheetName: string,
): Buffer {
  const data = rows.map((r) => {
    const obj: Record<string, string | number> = {}
    for (const c of columns) {
      const v = c.value(r)
      obj[c.header] = v == null ? '' : v
    }
    return obj
  })

  const sheet = XLSX.utils.json_to_sheet(data, {
    header: columns.map((c) => c.header),
  })
  sheet['!cols'] = columns.map((c) => ({ wch: c.width ?? 16 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31))

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function xlsxResponse(buf: Buffer, filenameBase: string): NextResponse {
  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filenameBase}-${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}

export function parseDateRange(searchParams: URLSearchParams): { desde: Date | null; hasta: Date | null } {
  const d = searchParams.get('desde')
  const h = searchParams.get('hasta')
  let desde: Date | null = null
  let hasta: Date | null = null
  if (d) {
    desde = new Date(d + 'T00:00:00')
    if (isNaN(desde.getTime())) desde = null
  }
  if (h) {
    hasta = new Date(h + 'T23:59:59.999')
    if (isNaN(hasta.getTime())) hasta = null
  }
  return { desde, hasta }
}
