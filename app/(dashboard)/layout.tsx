export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { TopBar } from '@/components/TopBar'
import { getSessionUser } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.isPlatformAdmin) redirect('/digital-dent-super-admin')
  if (!user.clinicaId) redirect('/login')
  if (user.requirePasswordChange) redirect('/cambiar-password')

  const clinica = await prisma.clinica.findUnique({ where: { id: user.clinicaId } })
  if (!clinica) redirect('/login')
  if (!clinica.activo) redirect('/login')

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar clinica={clinica.nombre} logoUrl={clinica.logoUrl ?? null} />
      <main className="pt-[60px]">
        {children}
      </main>
    </div>
  )
}
