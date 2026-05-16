import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { LoginClient, NoSlugLanding } from './login-client'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // El middleware inyecta x-clinica-slug si venimos de subdomain o /c/<slug>
  const h = await headers()
  const slug = h.get('x-clinica-slug')

  if (!slug) return <NoSlugLanding />

  const c = await prisma.clinica.findUnique({
    where: { slug },
    select: { slug: true, nombre: true, logoUrl: true, activo: true },
  })

  if (!c || !c.activo) return <NoSlugLanding />

  return <LoginClient clinica={{ slug: c.slug, nombre: c.nombre, logoUrl: c.logoUrl }} />
}
