import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { borrarClinicaDemo } from '@/lib/demo-cleanup'

export const dynamic = 'force-dynamic'

// POST /api/demo/cleanup — elimina las clínicas demo expiradas.
// Auth: header x-cron-secret = CRON_SECRET (cron de Railway diario) o
// sesión de super-admin (botón manual). Los leads se conservan.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  const isCron = Boolean(cronSecret && headerSecret && headerSecret === cronSecret)

  if (!isCron) {
    const u = await getSessionUser()
    if (!u?.isPlatformAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const expiradas = await prisma.clinica.findMany({
    where: { esDemo: true, demoExpiraEn: { lt: new Date() } },
    select: { id: true, slug: true },
  })

  let borradas = 0
  const errores: { slug: string; error: string }[] = []
  for (const c of expiradas) {
    try {
      await borrarClinicaDemo(c.id)
      borradas++
    } catch (e) {
      errores.push({ slug: c.slug, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ revisadas: expiradas.length, borradas, errores })
}
