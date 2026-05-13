import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const PACIENTE_FIELDS = [
  'rut', 'otroDocId', 'nombre', 'apellido', 'nombreSocial',
  'fechaNacimiento', 'genero', 'sexo', 'nacionalidad', 'migrante', 'puebloOriginario',
  'telefono', 'telefonoFijo', 'email', 'direccion', 'ciudad', 'comuna',
  'prevision', 'actividad', 'empleador', 'apoderado', 'rutApoderado', 'referencia',
  'tipoPaciente', 'numeroInterno', 'alergias', 'antecedentes', 'observaciones', 'activo',
] as const

function pickPacienteData(body: any): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const k of PACIENTE_FIELDS) {
    if (!(k in body)) continue
    const v = body[k]
    if (k === 'fechaNacimiento') {
      data[k] = v ? new Date(v) : null
    } else if (k === 'rut') {
      data[k] = v?.trim() ? v.trim() : null
    } else if (k === 'activo') {
      data[k] = Boolean(v)
    } else if (typeof v === 'string') {
      data[k] = v.trim() || null
    } else {
      data[k] = v
    }
  }
  return data
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const paciente = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId } })
  if (!paciente) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(paciente)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data = pickPacienteData(body)
  const paciente = await prisma.paciente.update({ where: { id }, data })
  return NextResponse.json(paciente)
}
