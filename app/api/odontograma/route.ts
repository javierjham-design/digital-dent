import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { pacienteId, fichaId, numero, estado } = await req.json()

  // Verificar que el paciente pertenezca a la clínica
  if (pacienteId) {
    const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, clinicaId: u.clinicaId }, select: { id: true } })
    if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
  }

  let fichaIdFinal = fichaId
  if (!fichaIdFinal) {
    let ficha = await prisma.fichaClinica.findUnique({ where: { pacienteId } })
    if (!ficha) {
      ficha = await prisma.fichaClinica.create({ data: { pacienteId, clinicaId: u.clinicaId } })
    }
    fichaIdFinal = ficha.id
  } else {
    // Validar que la ficha pertenezca a la clínica
    const ficha = await prisma.fichaClinica.findFirst({ where: { id: fichaIdFinal, clinicaId: u.clinicaId }, select: { id: true } })
    if (!ficha) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 })
  }

  const diente = await prisma.diente.upsert({
    where: { fichaId_numero_cara: { fichaId: fichaIdFinal, numero, cara: '' } },
    update: { estado },
    create: { fichaId: fichaIdFinal, numero, cara: '', estado },
  })
  return NextResponse.json(diente)
}
