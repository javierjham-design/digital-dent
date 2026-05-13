export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { SuperAdminTopBar } from './topbar'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()

  if (!user) {
    redirect('/login')
  }

  // No es super-admin: en vez de redirigir (riesgo de bucle), mostrar pantalla clara.
  if (!user.isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Acceso restringido</h1>
          <p className="text-slate-400 text-sm mb-1">Estás logueado como <span className="text-slate-200 font-medium">{user.email}</span></p>
          <p className="text-slate-400 text-sm mb-6">Esta cuenta no tiene permisos de super-administrador de la plataforma.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors">
              Ir al dashboard
            </Link>
            <Link href="/api/auth/signout?callbackUrl=/login" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors">
              Cerrar sesión
            </Link>
          </div>
          <p className="text-xs text-slate-600 mt-8">
            Si esperabas tener acceso, verifica que las variables de entorno{' '}
            <code className="px-1 bg-slate-800 rounded text-slate-400">SUPER_ADMIN_EMAIL</code> y{' '}
            <code className="px-1 bg-slate-800 rounded text-slate-400">SUPER_ADMIN_PASSWORD</code>{' '}
            estén configuradas en Vercel (Production) y dispara un Redeploy.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SuperAdminTopBar email={user.email} name={user.name ?? user.email} />
      <main className="pt-[60px]">
        {children}
      </main>
    </div>
  )
}
