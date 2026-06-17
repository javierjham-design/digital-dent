import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/plataforma', label: 'Dashboard', end: true },
  { to: '/plataforma/clinicas', label: 'Clínicas' },
  { to: '/plataforma/leads', label: 'Leads / Demos' },
  { to: '/plataforma/planes', label: 'Planes' },
]

export function SuperAdminLayout() {
  const { user, cargando, logout } = useAuth()
  if (cargando) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.isPlatformAdmin) return <Navigate to="/agenda" replace />

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white font-bold flex items-center justify-center">C</div>
          <div>
            <p className="text-sm font-bold leading-tight">Cláriva</p>
            <p className="text-[11px] text-slate-400 leading-tight">Plataforma</p>
          </div>
        </div>
        <nav className="flex items-center gap-1 flex-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-purple-500/15 text-purple-300' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 hidden sm:block">{user.email}</span>
          <button onClick={logout} className="text-sm text-slate-400 hover:text-rose-300">Salir</button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
