import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { pacienteId, prestacionId, piezas, zona, precio, notas, cara } = body

  // Verificar que el paciente y la prestación pertenezcan a la clínica
  const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, clinicaId: u.clinicaId }, select: { id: true } })
  if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
  const prestacion = await prisma.prestacion.findFirst({ where: { id: prestacionId, clinicaId: u.clinicaId }, select: { id: true } })
  if (!prestacion) return NextResponse.json({ error: 'Prestación no encontrada' }, { status: 404 })

  let ficha = await prisma.fichaClinica.findUnique({ where: { pacienteId } })
  if (!ficha) {
    ficha = await prisma.fichaClinica.create({ data: { pacienteId, clinicaId: u.clinicaId } })
  }

  if (piezas && piezas.length > 0) {
    const tratamientos = await Promise.all(
      piezas.map((pieza: number) =>
        prisma.tratamiento.create({
          data: {
            clinicaId: u.clinicaId!,
            fichaId: ficha!.id,
            prestacionId,
            diente: pieza,
            cara: cara || null,
            precio: Number(precio),
            notas: notas || null,
            estado: 'PLANIFICADO',
          },
          include: { prestacion: true },
        })
      )
    )
    return NextResponse.json(tratamientos, { status: 201 })
  } else {
    const tratamiento = await prisma.tratamiento.create({
      data: {
        clinicaId: u.clinicaId,
        fichaId: ficha.id,
        prestacionId,
        diente: null,
        cara: zona || cara || null,
        precio: Number(precio),
        notas: notas || null,
        estado: 'PLANIFICADO',
      },
      include: { prestacion: true },
    })
    return NextResponse.json([tratamiento], { status: 201 })
  }
}
