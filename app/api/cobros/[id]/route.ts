import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const cobro = await prisma.cobro.update({
    where: { id },
    data: {
      ...body,
      fechaPago: body.estado === 'PAGADO' ? new Date() : undefined,
    },
  })
  return NextResponse.json(cobro)
}
