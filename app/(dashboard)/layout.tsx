export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { TopBar } from '@/components/TopBar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.configuracion.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar clinica={config.clinica} logoUrl={config.logoUrl ?? null} />
      <main className="pt-[60px]">
        {children}
      </main>
    </div>
  )
}
