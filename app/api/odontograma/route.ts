import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { pacienteId, fichaId, numero, estado } = await req.json()

  let fichaIdFinal = fichaId
  if (!fichaIdFinal) {
    let ficha = await prisma.fichaClinica.findUnique({ where: { pacienteId } })
    if (!ficha) {
      ficha = await prisma.fichaClinica.create({ data: { pacienteId } })
    }
    fichaIdFinal = ficha.id
  }

  const diente = await prisma.diente.upsert({
    where: { fichaId_numero_cara: { fichaId: fichaIdFinal, numero, cara: '' } },
    update: { estado },
    create: { fichaId: fichaIdFinal, numero, cara: '', estado },
  })
  return NextResponse.json(diente)
}
