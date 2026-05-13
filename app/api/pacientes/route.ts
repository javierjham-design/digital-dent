import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const PACIENTE_FIELDS = [
  'rut', 'otroDocId', 'nombre', 'apellido', 'nombreSocial',
  'fechaNacimiento', 'genero', 'sexo', 'nacionalidad', 'migrante', 'puebloOriginario',
  'telefono', 'telefonoFijo', 'email', 'direccion', 'ciudad', 'comuna',
  'prevision', 'actividad', 'empleador', 'apoderado', 'rutApoderado', 'referencia',
  'tipoPaciente', 'numeroInterno', 'alergias', 'antecedentes', 'observaciones',
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
    } else if (typeof v === 'string') {
      data[k] = v.trim() || null
    } else {
      data[k] = v
    }
  }
  return data
}

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: { apellido: 'asc' },
  })
  return NextResponse.json(pacientes)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  if (!body.nombre || !body.apellido) {
    return NextResponse.json({ error: 'nombre y apellido son requeridos' }, { status: 400 })
  }

  // Calcular numero correlativo por clínica
  const max = await prisma.paciente.aggregate({
    where: { clinicaId: u.clinicaId },
    _max: { numero: true },
  })
  const numero = (max._max.numero ?? 0) + 1

  const data = pickPacienteData(body)
  const paciente = await prisma.paciente.create({
    data: {
      ...(data as any),
      clinicaId: u.clinicaId,
      numero,
    },
  })
  return NextResponse.json(paciente, { status: 201 })
}
