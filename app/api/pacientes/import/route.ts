import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Row = Record<string, unknown>

function pickString(row: Row, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function normalizeRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return ''
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  return `${body}-${dv}`
}

function parseFecha(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))
    }
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()))
  }

  const s = String(raw).trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  }

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmy) {
    let year = +dmy[3]
    if (year < 100) year += year < 50 ? 2000 : 1900
    return new Date(Date.UTC(year, +dmy[2] - 1, +dmy[1]))
  }

  const fallback = new Date(s)
  return isNaN(fallback.getTime()) ? null : fallback
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Archivo no recibido' }, { status: 400 })
  }

  let rows: Row[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('Archivo sin hojas')
    const sheet = wb.Sheets[sheetName]
    rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: true })
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo leer el archivo: ${e.message ?? e}` }, { status: 400 })
  }

  const errores: { fila: number; motivo: string }[] = []
  const validos: {
    rut: string; nombre: string; apellido: string
    telefono: string | null; email: string | null; direccion: string | null
    fechaNacimiento: Date | null
  }[] = []

  const rutsVistos = new Set<string>()

  rows.forEach((row, idx) => {
    const fila = idx + 2

    const nombre = pickString(row, ['Nombres', 'Nombre', 'nombre', 'nombres'])
    const apellido = pickString(row, ['Apellidos', 'Apellido', 'apellido', 'apellidos'])
    const rutRaw = pickString(row, ['RUT', 'Rut', 'rut'])
    const telefono = pickString(row, ['Telefono', 'Teléfono', 'telefono', 'teléfono'])
    const direccion = pickString(row, ['Dirección', 'Direccion', 'direccion', 'dirección'])
    const email = pickString(row, ['Correo Electrónico', 'Correo Electronico', 'Email', 'Correo', 'email', 'correo'])
    const fechaRaw = row['Fecha de Nacimiento'] ?? row['Fecha Nacimiento'] ?? row['fecha de nacimiento'] ?? row['fechaNacimiento']

    if (!nombre && !apellido && !rutRaw) return

    if (!nombre) { errores.push({ fila, motivo: 'Falta Nombres' }); return }
    if (!apellido) { errores.push({ fila, motivo: 'Falta Apellidos' }); return }
    if (!rutRaw) { errores.push({ fila, motivo: 'Falta RUT' }); return }

    const rut = normalizeRut(rutRaw)
    if (!rut) { errores.push({ fila, motivo: `RUT inválido: ${rutRaw}` }); return }

    if (rutsVistos.has(rut)) { errores.push({ fila, motivo: `RUT duplicado en archivo: ${rut}` }); return }
    rutsVistos.add(rut)

    validos.push({
      rut,
      nombre,
      apellido,
      telefono: telefono || null,
      email: email || null,
      direccion: direccion || null,
      fechaNacimiento: parseFecha(fechaRaw),
    })
  })

  let creados = 0
  if (validos.length > 0) {
    const result = await prisma.paciente.createMany({
      data: validos,
      skipDuplicates: true,
    })
    creados = result.count
  }

  return NextResponse.json({
    total: rows.length,
    creados,
    duplicados: validos.length - creados,
    errores,
  })
}
