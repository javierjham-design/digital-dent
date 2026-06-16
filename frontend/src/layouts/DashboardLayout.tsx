import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/agenda', label: 'Agenda' },
  { to: '/pacientes', label: 'Pacientes' },
]

export function DashboardLayout() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="h-14 bg-white border-b border-slate-100 flex items-center px-4 gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold flex items-center justify-center">C</div>
          <span className="font-bold tracking-tight">Cláriva</span>
        </div>
        <nav className="flex items-center gap-1 flex-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 hidden sm:block">{user?.name ?? user?.email}</span>
          <button onClick={logout} className="text-sm text-slate-500 hover:text-rose-600">Salir</button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
