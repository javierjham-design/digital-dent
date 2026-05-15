import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { LoginClient } from './login-client'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // El middleware inyecta x-clinica-slug si venimos de subdomain o /c/<slug>
  const h = await headers()
  const slug = h.get('x-clinica-slug')

  let clinicaInfo: { slug: string; nombre: string; logoUrl: string | null } | null = null
  if (slug) {
    const c = await prisma.clinica.findUnique({
      where: { slug },
      select: { slug: true, nombre: true, logoUrl: true, activo: true },
    })
    if (c && c.activo) {
      clinicaInfo = { slug: c.slug, nombre: c.nombre, logoUrl: c.logoUrl }
    }
  }

  return <LoginClient clinica={clinicaInfo} />
}
