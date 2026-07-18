import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'

interface VarConfig { nombre: string; presente: boolean; requerida: boolean }
interface Integracion { clave: string; nombre: string; configurada: boolean | null; nota: string; variables: VarConfig[] }
interface Config {
  integraciones: Integracion[]
  plataforma: VarConfig[]
  catalogos: {
    modulos: { code: string; nombre: string; descripcion: string }[]
    verticales: string[]
    paises: { code: string; nombre: string; bandera: string; moneda: string }[]
  }
}
const RUBRO: Record<string, string> = { dental: 'Dental', medico: 'Médico', estetica: 'Estética' }

export function AdminConfiguracion() {
  const [c, setC] = useState<Config | null>(null)
  useEffect(() => { adminService.configuracion().then((r) => setC(r as Config)).catch(() => {}) }, [])

  if (!c) return <p className="text-slate-500 text-sm">Cargando…</p>

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Configuración</h1>
      <p className="text-sm text-slate-400 mb-6">Estado de las integraciones y catálogos de la plataforma. Las credenciales se cargan como variables de entorno en Railway (servicio BACKEND); por seguridad nunca se guardan en la base ni se muestran aquí.</p>

      {/* Integraciones */}
      <h2 className="text-sm font-semibold text-white mb-3">Integraciones</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mb-8">
        {c.integraciones.map((i) => (
          <div key={i.clave} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-white">{i.nombre}</p>
              <Estado v={i.configurada} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{i.nota}</p>
            {i.variables.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {i.variables.map((v) => (
                  <li key={v.nombre} className="flex items-center justify-between gap-2 text-xs">
                    <code className="text-slate-300 break-all">{v.nombre}{!v.requerida && <span className="text-slate-600"> (opcional)</span>}</code>
                    <span className={`shrink-0 font-semibold ${v.presente ? 'text-emerald-400' : v.requerida ? 'text-rose-400' : 'text-slate-500'}`}>{v.presente ? '✓' : v.requerida ? '✗ falta' : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
            {i.clave === 'whatsapp' && <Link to="/plataforma/clinicas" className="inline-block mt-3 text-xs font-semibold text-cyan-400 hover:text-cyan-300">Configurar por clínica →</Link>}
          </div>
        ))}
      </div>

      {/* Plataforma (env) */}
      <h2 className="text-sm font-semibold text-white mb-3">Parámetros de la plataforma</h2>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-8">
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {c.plataforma.map((v) => (
            <li key={v.nombre} className="flex items-center justify-between gap-2 text-xs">
              <code className="text-slate-300 break-all">{v.nombre}{!v.requerida && <span className="text-slate-600"> (opcional)</span>}</code>
              <span className={`shrink-0 font-semibold ${v.presente ? 'text-emerald-400' : v.requerida ? 'text-rose-400' : 'text-slate-500'}`}>{v.presente ? '✓' : v.requerida ? '✗ falta' : '—'}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Catálogos */}
      <h2 className="text-sm font-semibold text-white mb-3">Catálogos</h2>
      <div className="grid gap-3 md:grid-cols-3 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between"><p className="font-semibold text-white text-sm">Módulos</p><Link to="/plataforma/planes" className="text-xs text-cyan-400 hover:text-cyan-300">Asignar en planes →</Link></div>
          <ul className="mt-3 space-y-2">
            {c.catalogos.modulos.map((m) => (
              <li key={m.code}><p className="text-sm text-slate-200">{m.nombre}</p><p className="text-[11px] text-slate-500">{m.descripcion}</p></li>
            ))}
          </ul>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="font-semibold text-white text-sm">Rubros</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {c.catalogos.verticales.map((v) => <span key={v} className="text-xs px-2 py-1 rounded-lg bg-slate-800 text-slate-300">{RUBRO[v] ?? v}</span>)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="font-semibold text-white text-sm">Países soportados <span className="text-slate-500 font-normal">({c.catalogos.paises.length})</span></p>
          <div className="mt-3 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {c.catalogos.paises.map((p) => <span key={p.code} className="text-xs px-2 py-1 rounded-lg bg-slate-800 text-slate-300">{p.bandera} {p.nombre} · {p.moneda}</span>)}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">La configuración por clínica (plan, módulos, usuarios extra, WhatsApp, país, cobro) vive en <Link to="/plataforma/clinicas" className="text-cyan-400 hover:text-cyan-300">Clínicas → cada clínica</Link>. Los planes y precios se gestionan en <Link to="/plataforma/planes" className="text-cyan-400 hover:text-cyan-300">Planes</Link>.</p>
    </div>
  )
}

function Estado({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Por clínica</span>
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{v ? '✓ Conectada' : 'Sin conexión'}</span>
}
