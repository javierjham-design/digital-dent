import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'

// Lee el slug de la clínica desde el header inyectado por el middleware.
// Devuelve null si no hay (estamos en el dominio raíz / super-admin).
export async function getClinicaSlugFromContext(): Promise<string | null> {
  const h = await headers()
  return h.get('x-clinica-slug')
}

export async function getClinicaFromContext() {
  const slug = await getClinicaSlugFromContext()
  if (!slug) return null
  return prisma.clinica.findUnique({ where: { slug } })
}
