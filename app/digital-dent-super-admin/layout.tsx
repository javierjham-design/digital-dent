export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { SuperAdminTopBar } from './topbar'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!user.isPlatformAdmin) redirect('/')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SuperAdminTopBar email={user.email} name={user.name ?? user.email} />
      <main className="pt-[60px]">
        {children}
      </main>
    </div>
  )
}
