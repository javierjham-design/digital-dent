import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Búsqueda rápida para el buscador global de la TopBar.
// Acepta `q` (texto libre) y devuelve hasta 10 coincidencias por nombre, apellido o RUT.
export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json([])

  // RUT normalizado: solo dígitos y K final, para matchear "12.345.678-9" o "123456789"
  const rutDigits = q.replace(/[^0-9kK]/g, '').toLowerCase()

  // Tokens del query (para "Juan Perez" matchear nombre + apellido por separado)
  const tokens = q.split(/\s+/).filter(t => t.length >= 2)

  const where: Record<string, unknown> = {
    clinicaId: u.clinicaId,
    activo: true,
    OR: [
      { nombre:   { contains: q, mode: 'insensitive' } },
      { apellido: { contains: q, mode: 'insensitive' } },
      ...(rutDigits.length >= 4 ? [{ rut: { contains: rutDigits, mode: 'insensitive' as const } }] : []),
      ...(tokens.length >= 2 ? [{
        AND: tokens.map(t => ({
          OR: [
            { nombre:   { contains: t, mode: 'insensitive' as const } },
            { apellido: { contains: t, mode: 'insensitive' as const } },
          ],
        })),
      }] : []),
    ],
  }

  const pacientes = await prisma.paciente.findMany({
    where,
    select: { id: true, nombre: true, apellido: true, rut: true, telefono: true, numero: true },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    take: 10,
  })

  return NextResponse.json(pacientes)
}
