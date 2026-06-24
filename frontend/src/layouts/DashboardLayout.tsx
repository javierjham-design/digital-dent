import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { PacienteDTO } from '@shared/types'
import { useAuth } from '@/hooks/useAuth'
import { pacientesService } from '@/services/clinica.service'
import { CambiarPasswordModal } from '@/components/CambiarPasswordModal'

const NAV_PRE = [
  { to: '/agenda', label: 'Agenda' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/cobros', label: 'Cobros' },
]
const NAV_POST = [
  { to: '/prestaciones', label: 'Prestaciones' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/equipo', label: 'Equipo' },
  { to: '/configuracion', label: 'Config.' },
  { to: '/ayuda', label: 'Ayuda' },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`

function LiquidacionesMenu({ puedeGestionar }: { puedeGestionar: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const activo = pathname.startsWith('/liquidaciones') || pathname.startsWith('/mis-liquidaciones')

  // Cerrar al hacer click fuera del menú (no por hover, que cerraba al cruzar el hueco).
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Si no gestiona, no hace falta submenú: va directo a "Mis liquidaciones".
  if (!puedeGestionar) {
    return <NavLink to="/mis-liquidaciones" className={linkCls}>Liquidaciones</NavLink>
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activo ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
        Liquidaciones ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-1 w-52 z-20">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <NavLink to="/liquidaciones" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Gestión de liquidaciones</NavLink>
            <NavLink to="/mis-liquidaciones" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100">Mis liquidaciones</NavLink>
          </div>
        </div>
      )}
    </div>
  )
}

// Buscador de pacientes anclado al header: busca en el servidor a medida que se
// escribe y navega a la ficha al elegir.
function BuscadorPacientesHeader() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PacienteDTO[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      pacientesService.listar(term).then((r) => { setResults(r.slice(0, 8)); setOpen(true) }).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const ir = (id: string) => { navigate(`/pacientes/${id}`); setQ(''); setResults([]); setOpen(false) }

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <input value={q} onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); (e.currentTarget as HTMLInputElement).blur() } }}
        placeholder="Buscar paciente…"
        className="w-44 lg:w-60 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-30 max-h-80 overflow-y-auto">
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => ir(p.id)} className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
              <p className="text-sm text-slate-800">{p.nombre} {p.apellido}</p>
              <p className="text-xs text-slate-400 font-mono">{p.rut ?? 'Sin RUT'}{p.telefono ? ` · ${p.telefono}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const [cambiarPass, setCambiarPass] = useState(false)
  // Si el admin reseteó la contraseña o es el primer ingreso, forzar el cambio.
  const forzado = Boolean(user?.requirePasswordChange)
  useEffect(() => { if (forzado) setCambiarPass(true) }, [forzado])

  if (user?.isPlatformAdmin) return <Navigate to="/plataforma" replace />
  const puedeGestionarLiq = Boolean(user?.permisos?.puedeGestionarLiquidaciones)
  return (
    <div className="min-h-screen">
      <header className="h-14 bg-white border-b border-slate-100 flex items-center px-4 gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold flex items-center justify-center">C</div>
          <span className="font-bold tracking-tight">Cláriva</span>
        </div>
        <BuscadorPacientesHeader />
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
          {NAV_PRE.map((n) => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
          <LiquidacionesMenu puedeGestionar={puedeGestionarLiq} />
          {NAV_POST.map((n) => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm text-slate-600">{user?.name ?? user?.email}</span>
            <button onClick={() => setCambiarPass(true)} className="text-xs text-slate-400 hover:text-cyan-600">Cambiar contraseña</button>
          </div>
          <button onClick={logout} className="text-sm text-slate-500 hover:text-rose-600">Salir</button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
      {cambiarPass && <CambiarPasswordModal forzado={forzado} onClose={() => setCambiarPass(false)} />}
    </div>
  )
}
