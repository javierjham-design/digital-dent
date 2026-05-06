export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.configuracion.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        clinica={config.clinica}
        ciudad={config.ciudad}
        logoUrl={config.logoUrl ?? null}
      />
      <main className="flex-1 ml-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
