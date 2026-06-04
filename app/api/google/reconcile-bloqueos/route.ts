import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { findMatchingPaciente } from '@/lib/google-sync'

// POST /api/google/reconcile-bloqueos
//
// Recorre los BloqueoAgenda que vinieron de Google (tienen googleEventId) y
// cuyo motivo coincide unívocamente con un paciente activo de la clínica.
// Los convierte a Cita real, conservando el googleEventId para que el push
// siga funcionando con el mismo evento de Google.
//
// Útil para la migración inicial desde Dentalink: cuando antes el sync solo
// creaba bloqueos genéricos, este endpoint los "promueve" a citas reales una
// vez ejecutado.
//
// Solo admin.
export async function POST(_req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const bloqueos = await prisma.bloqueoAgenda.findMany({
    where: {
      clinicaId: u.clinicaId,
      googleEventId: { not: null },
    },
    select: { id: true, doctorId: true, inicio: true, fin: true, motivo: true, googleEventId: true },
  })

  let converted = 0
  const skipped: { id: string; motivo: string | null; reason: string }[] = []

  for (const b of bloqueos) {
    const pacienteId = await findMatchingPaciente(u.clinicaId, b.motivo ?? '')
    if (!pacienteId) {
      skipped.push({ id: b.id, motivo: b.motivo, reason: 'no_unique_match' })
      continue
    }
    const duracionMin = Math.max(15, Math.round((b.fin.getTime() - b.inicio.getTime()) / 60000))
    try {
      await prisma.$transaction([
        prisma.cita.create({
          data: {
            clinicaId: u.clinicaId,
            pacienteId,
            doctorId: b.doctorId,
            fecha: b.inicio,
            duracion: duracionMin,
            estado: 'CONFIRMADA',
            tipo: 'CONSULTA',
            googleEventId: b.googleEventId,
            googleSyncedAt: new Date(),
            logs: {
              create: {
                tipo: 'AGENDADA',
                detalle: `Convertida desde bloqueo (título original: "${b.motivo ?? ''}")`,
                userName: u.name ?? u.email ?? 'Sistema',
              },
            },
          },
        }),
        prisma.bloqueoAgenda.delete({ where: { id: b.id } }),
      ])
      converted++
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'conversion_failed'
      skipped.push({ id: b.id, motivo: b.motivo, reason: msg.slice(0, 100) })
    }
  }

  return NextResponse.json({
    total: bloqueos.length,
    converted,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 20), // primeros 20 para no inflar el response
  })
}
