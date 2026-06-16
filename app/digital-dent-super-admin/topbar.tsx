'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard',     href: '/digital-dent-super-admin' },
  { label: 'Clínicas',      href: '/digital-dent-super-admin/clinicas' },
  { label: 'Leads / Demos', href: '/digital-dent-super-admin/leads' },
  { label: 'Suscripciones', href: '/digital-dent-super-admin/suscripciones' },
  { label: 'Planes',        href: '/digital-dent-super-admin/planes' },
]

export function SuperAdminTopBar({ email, name }: { email: string; name: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] bg-slate-900 border-b border-slate-800 z-50 flex items-center px-6 gap-6">
      <Link href="/digital-dent-super-admin" className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-lg flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Cláriva</p>
          <p className="text-xs text-slate-400 leading-tight">Panel de administración</p>
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

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <div className="text-right hidden sm:block">
            <p className="text-slate-200 font-medium leading-tight text-sm">{name}</p>
            <p className="text-xs text-slate-500 leading-tight">{email}</p>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {(name || email || 'A')[0]?.toUpperCase()}
            </span>
          </div>
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 z-20">
              <div className="px-4 py-2.5 border-b border-slate-800">
                <p className="text-sm font-medium text-slate-200 truncate">{name || 'Super-administrador'}</p>
                <p className="text-xs text-slate-500 truncate">{email}</p>
              </div>
              <Link
                href="/digital-dent-super-admin/mi-cuenta"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Mi cuenta
              </Link>
              <button
                onClick={() => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : ''
                  signOut({ callbackUrl: `${origin}/digital-dent-admin-login` })
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-red-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
