export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { ConfiguracionClient } from './configuracion-client'

export default async function ConfiguracionPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const [clinica, mediosPago] = await Promise.all([
    prisma.clinica.findUnique({ where: { id: u.clinicaId } }),
    prisma.medioPago.findMany({ where: { clinicaId: u.clinicaId }, orderBy: { nombre: 'asc' } }),
  ])

  if (!clinica) redirect('/login')

  // Adaptar al shape esperado por el cliente legacy (campos del Configuracion antiguo)
  const config = {
    id: clinica.id,
    clinica: clinica.nombre,
    direccion: clinica.direccion,
    telefono: clinica.telefono,
    email: clinica.email,
    ciudad: clinica.ciudad,
    mensajeWA: clinica.mensajeWA,
    logoUrl: clinica.logoUrl,
  }

  return <ConfiguracionClient config={config} mediosPago={mediosPago} />
}
