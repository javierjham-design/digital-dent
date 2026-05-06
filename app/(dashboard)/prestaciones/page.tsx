import { prisma } from '@/lib/prisma'
import { PrestacionesClient } from './prestaciones-client'

export default async function PrestacionesPage() {
  const prestaciones = await prisma.prestacion.findMany({ orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }] })
  return <PrestacionesClient initialPrestaciones={prestaciones} />
}
