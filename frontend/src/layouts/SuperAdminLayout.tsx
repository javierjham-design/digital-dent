import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/plataforma', label: 'Dashboard', end: true },
  { to: '/plataforma/clinicas', label: 'Clínicas' },
  { to: '/plataforma/leads', label: 'Leads / Demos' },
  { to: '/plataforma/planes', label: 'Planes' },
]

export function SuperAdminLayout() {
  const { user, cargando, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname]) // cierra el menú al navegar

  if (cargando) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.isPlatformAdmin) return <Navigate to="/agenda" replace />

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-purple-500/15 text-purple-300' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`
  const mobileLink = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-purple-500/15 text-purple-300' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
        <div className="h-14 flex items-center px-4 gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white font-bold flex items-center justify-center">C</div>
            <div>
              <p className="text-sm font-bold leading-tight">Cláriva</p>
              <p className="text-[11px] text-slate-400 leading-tight">Plataforma</p>
            </div>
          </div>

          {/* Nav horizontal (desktop) */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={desktopLink}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <span className="text-sm text-slate-400 max-w-[220px] truncate">{user.email}</span>
            <button onClick={logout} className="text-sm text-slate-400 hover:text-rose-300">Salir</button>
          </div>

          {/* Botón hamburguesa (móvil) */}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open}
            className="md:hidden ml-auto w-10 h-10 -mr-2 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
            <span className="text-xl leading-none">{open ? '✕' : '☰'}</span>
          </button>
        </div>

        {/* Menú desplegable (móvil) */}
        {open && (
          <nav className="md:hidden border-t border-slate-800 px-2 py-2 space-y-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={mobileLink}>{n.label}</NavLink>
            ))}
            <div className="flex items-center justify-between gap-2 border-t border-slate-800 mt-2 pt-2 px-3">
              <span className="text-xs text-slate-400 truncate">{user.email}</span>
              <button onClick={logout} className="text-sm font-medium text-rose-300 hover:text-rose-200 shrink-0">Salir</button>
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
