'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/cobros',      label: 'Cobros' },
  { href: '/cobros/caja', label: 'Caja' },
]

export function CobrosSubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 bg-slate-100 rounded-xl p-1 inline-flex mb-4">
      {TABS.map(t => {
        const active = t.href === '/cobros'
          ? (pathname === '/cobros' || pathname === '/cobros/')
          : pathname.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              active ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
