import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { PacienteDTO } from '@shared/types'
import { useAuth } from '@/hooks/useAuth'
import { pacientesService } from '@/services/clinica.service'
import { clinicaService } from '@/services/catalogo.service'
import { CambiarPasswordModal } from '@/components/CambiarPasswordModal'
import { HelpWidget } from '@/components/HelpWidget'
import { aplicarBrandingClinica } from '@/lib/branding'

const NAV_PRE = [
  { to: '/agenda', label: 'Agenda' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/cobros', label: 'Cobros' },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`

// Menú "Gestión": agrupa la configuración y el back-office en secciones (Clínica,
// Documentos, Captación, Dinero, Análisis, Cuenta), respetando el permiso de cada ítem.
// Una sección sin ningún ítem visible no muestra su título.
function GestionMenu({ esAdmin, puedeConfig, puedeEquipo, puedePrestaciones, puedeCajas, puedeVerReportes, modAgenda }: { esAdmin: boolean; puedeConfig: boolean; puedeEquipo: boolean; puedePrestaciones: boolean; puedeCajas: boolean; puedeVerReportes: boolean; modAgenda: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const rutas = ['/configuracion', '/equipo', '/boxes', '/prestaciones', '/consentimientos', '/recetas-documentos', '/agendamiento-online', '/gestion-cajas', '/liquidaciones', '/mis-liquidaciones', '/reportes', '/suscripcion']
  const activo = rutas.some((r) => pathname.startsWith(r))

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const it = (cond: boolean, to: string, label: string): [string, string] | null => (cond ? [to, label] : null)
  const secciones: { titulo: string; items: [string, string][] }[] = [
    { titulo: 'Clínica', items: [
      it(esAdmin || puedeConfig, '/configuracion', 'Configuración general'),
      it(esAdmin || puedeEquipo, '/equipo', 'Equipo'),
      it(esAdmin || puedeConfig, '/boxes', 'Boxes / Salas de atención'),
      it(esAdmin || puedePrestaciones, '/prestaciones', 'Prestaciones'),
    ].filter((x): x is [string, string] => x !== null) },
    { titulo: 'Documentos', items: [
      it(esAdmin || puedeConfig, '/consentimientos', 'Consentimientos'),
      it(esAdmin || puedeConfig, '/recetas-documentos', 'Recetas y documentos'),
    ].filter((x): x is [string, string] => x !== null) },
    { titulo: 'Captación', items: [
      it((esAdmin || puedeConfig) && modAgenda, '/agendamiento-online', 'Agendamiento online'),
    ].filter((x): x is [string, string] => x !== null) },
    { titulo: 'Dinero', items: [
      it(esAdmin || puedeCajas, '/gestion-cajas', 'Gestión de cajas'),
      // Una sola entrada: la ruta muestra la vista de gestión o la propia según el permiso.
      it(true, '/liquidaciones', 'Liquidaciones'),
    ].filter((x): x is [string, string] => x !== null) },
    { titulo: 'Análisis', items: [
      it(esAdmin || puedeVerReportes, '/reportes', 'Reportes'),
    ].filter((x): x is [string, string] => x !== null) },
    { titulo: 'Cuenta', items: [
      it(esAdmin, '/suscripcion', 'Suscripción y pagos'),
    ].filter((x): x is [string, string] => x !== null) },
  ]
  const visibles = secciones.filter((s) => s.items.length > 0)

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activo ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
        Gestión ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-1 w-60 z-20">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1 max-h-[80vh] overflow-y-auto">
            {visibles.map((s, i) => (
              <div key={s.titulo} className={i > 0 ? 'border-t border-slate-100 mt-1 pt-1' : ''}>
                <p className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.titulo}</p>
                {s.items.map(([to, label]) => (
                  <NavLink key={to} to={to} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">{label}</NavLink>
                ))}
              </div>
            ))}
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
    <div className="relative order-2 flex-1 min-w-0 sm:flex-none" ref={ref}>
      <input value={q} onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); (e.currentTarget as HTMLInputElement).blur() } }}
        placeholder="Buscar paciente…"
        className="w-full sm:w-56 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-72 max-w-[85vw] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-30 max-h-80 overflow-y-auto">
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
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => {
    clinicaService.obtener().then((c) => {
      setLogo(c.logoUrl)
      aplicarBrandingClinica({ nombre: c.nombre, logoUrl: c.logoUrl })
    }).catch(() => {})
  }, [])
  // Si el admin reseteó la contraseña o es el primer ingreso, forzar el cambio.
  const forzado = Boolean(user?.requirePasswordChange)
  useEffect(() => { if (forzado) setCambiarPass(true) }, [forzado])

  if (user?.isPlatformAdmin) return <Navigate to="/plataforma" replace />
  const puedeCrm = Boolean(user?.permisos?.puedeGestionarCrm)
  const puedeCajas = Boolean(user?.permisos?.puedeGestionarCajas)
  const puedeConfig = Boolean(user?.permisos?.puedeConfigurarClinica)
  const puedeEquipo = Boolean(user?.permisos?.puedeGestionarEquipo)
  const puedePrestaciones = Boolean(user?.permisos?.puedeGestionarPrestaciones)
  const puedeVerReportes = Boolean(user?.permisos?.puedeVerReportes)
  const esAdmin = user?.role === 'admin'
  const mods = user?.modulos ?? []
  const modCrm = mods.includes('crm')
  const modAgenda = mods.includes('agendamiento_online')
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 shrink-0 order-1">
          {logo
            ? <img src={logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-white" />
            : <img src="/icon.png" alt="Cláriva" className="w-8 h-8 rounded-lg" />}
          <span className="font-bold tracking-tight hidden sm:inline">Cláriva</span>
        </div>
        <BuscadorPacientesHeader />
        <div className="flex items-center gap-3 shrink-0 order-3 sm:order-4">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm text-slate-600">{user?.name ?? user?.email}</span>
            <button onClick={() => setCambiarPass(true)} className="text-xs text-slate-400 hover:text-cyan-600">Cambiar contraseña</button>
          </div>
          <button onClick={logout} className="text-sm text-slate-500 hover:text-rose-600">Salir</button>
        </div>
        <nav className="flex flex-wrap items-center gap-1 w-full order-4 sm:order-3 sm:w-auto sm:flex-1">
          {NAV_PRE.map((n) => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
          {/* CRM es trabajo diario (leads sin gestionar): va anclado en el header, no
              escondido en el desplegable. Misma condición de visibilidad que antes. */}
          {modCrm && (esAdmin || puedeCrm) && <NavLink to="/crm" className={linkCls}>CRM · Leads</NavLink>}
          <GestionMenu esAdmin={esAdmin} puedeConfig={puedeConfig} puedeEquipo={puedeEquipo} puedePrestaciones={puedePrestaciones} puedeCajas={puedeCajas} puedeVerReportes={puedeVerReportes} modAgenda={modAgenda} />
          <NavLink to="/ayuda" className={linkCls}>Ayuda</NavLink>
        </nav>
      </header>
      {/* overflow-x-clip: contiene cualquier desborde horizontal a nivel de página
          (evita el zoom-out en iOS) sin romper el header sticky, que es hermano de
          <main>. Los contenidos anchos (calendario, tablas) scrollean en su propio
          contenedor overflow-x-auto. `clip` (no `hidden`) no crea scroll vertical. */}
      <main className="max-w-7xl mx-auto px-4 py-8 overflow-x-clip">
        <Outlet />
      </main>
      <HelpWidget />
      {cambiarPass && <CambiarPasswordModal forzado={forzado} onClose={() => setCambiarPass(false)} />}
    </div>
  )
}
