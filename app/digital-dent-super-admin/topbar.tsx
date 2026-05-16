'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard', href: '/digital-dent-super-admin' },
  { label: 'Clínicas',  href: '/digital-dent-super-admin/clinicas' },
]

export function SuperAdminTopBar({ email, name }: { email: string; name: string }) {
  const pathname = usePathname()
  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] bg-slate-900 border-b border-slate-800 z-50 flex items-center px-6 gap-6">
      <Link href="/digital-dent-super-admin" className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-lg flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Super-Admin</p>
          <p className="text-xs text-slate-400 leading-tight">Control plane</p>
        </div>
      </Link>

      <div className="w-px h-6 bg-slate-700 flex-shrink-0" />

      <nav className="flex items-center gap-1 flex-1">
        {NAV.map((item) => {
          const active = item.href === '/digital-dent-super-admin'
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-purple-500/15 text-purple-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center gap-3 text-sm">
        <div className="text-right hidden sm:block">
          <p className="text-slate-200 font-medium leading-tight">{name}</p>
          <p className="text-xs text-slate-500 leading-tight">{email}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/digital-dent-admin-login' })}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
