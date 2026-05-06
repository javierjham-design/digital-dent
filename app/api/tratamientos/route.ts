import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { pacienteId, prestacionId, piezas, zona, precio, notas, cara } = body

  // Obtener o crear ficha clínica
  let ficha = await prisma.fichaClinica.findUnique({ where: { pacienteId } })
  if (!ficha) {
    ficha = await prisma.fichaClinica.create({ data: { pacienteId } })
  }

  // Si hay piezas seleccionadas, crear un tratamiento por pieza
  // Si es zona, crear uno solo con diente=null y cara=zona
  if (piezas && piezas.length > 0) {
    const tratamientos = await Promise.all(
      piezas.map((pieza: number) =>
        prisma.tratamiento.create({
          data: {
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
