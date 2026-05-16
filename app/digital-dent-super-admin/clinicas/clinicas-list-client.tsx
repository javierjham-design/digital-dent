'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CopiarUrlButton } from './copiar-url-btn'

type Clinica = {
  id: string; slug: string; nombre: string
  plan: string; activo: boolean
  ciudad: string; email: string; telefono: string
  trialHasta: string | null; createdAt: string
  usuarios: number; pacientes: number; citas: number
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function ClinicasListClient({ clinicas, platformDomain }: { clinicas: Clinica[]; platformDomain: string | null }) {
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<string>('TODOS')
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clinicas.filter((c) => {
      if (q && !`${c.nombre} ${c.slug} ${c.ciudad} ${c.email}`.toLowerCase().includes(q)) return false
      if (planFilter !== 'TODOS' && c.plan !== planFilter) return false
      if (estadoFilter === 'ACTIVA' && !c.activo) return false
      if (estadoFilter === 'SUSPENDIDA' && c.activo) return false
      return true
    })
  }, [clinicas, search, planFilter, estadoFilter])

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Clínicas</h1>
          <p className="text-slate-400 mt-1 text-sm">{clinicas.length} clínicas registradas en la plataforma</p>
        </div>
        <Link href="/digital-dent-super-admin/clinicas/nueva"
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-medium text-white shadow-lg shadow-purple-500/20 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva clínica
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[260px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre, slug, ciudad o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="TODOS">Todos los planes</option>
          <option value="TRIAL">Trial</option>
          <option value="BASICO">Básico</option>
          <option value="PRO">Pro</option>
        </select>
        <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="TODOS">Todos los estados</option>
          <option value="ACTIVA">Activas</option>
          <option value="SUSPENDIDA">Suspendidas</option>
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500 bg-slate-900/50">
              <th className="text-left px-6 py-3">Clínica</th>
              <th className="text-left px-6 py-3">Contacto</th>
              <th className="text-left px-6 py-3">Plan / Trial</th>
              <th className="text-left px-6 py-3">Estado</th>
              <th className="text-right px-6 py-3">Usuarios</th>
              <th className="text-right px-6 py-3">Pacientes</th>
              <th className="text-right px-6 py-3">Citas</th>
              <th className="text-right px-6 py-3">Creada</th>
              <th className="text-right px-6 py-3">Acceso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-500">Sin resultados</td></tr>
            ) : filtered.map((c) => {
              const dias = daysUntil(c.trialHasta)
              return (
                <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/digital-dent-super-admin/clinicas/${c.id}`} className="text-white font-medium hover:text-purple-300">
                      {c.nombre}
                    </Link>
                    <p className="text-xs text-slate-500 font-mono">{c.slug}</p>
                  </td>
                  <td className="px-6 py-3 text-slate-300 text-xs">
                    {c.ciudad && <div>{c.ciudad}</div>}
                    {c.email && <div className="text-slate-500">{c.email}</div>}
                    {c.telefono && <div className="text-slate-500">{c.telefono}</div>}
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">{c.plan}</span>
                    {c.plan === 'TRIAL' && dias !== null && (
                      <p className={`text-xs mt-1 ${dias <= 5 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {dias > 0 ? `${dias} días restantes` : `Vencido hace ${-dias} días`}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {c.activo
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">Activa</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300">Suspendida</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-300">{c.usuarios}</td>
                  <td className="px-6 py-3 text-right text-slate-300">{c.pacientes}</td>
                  <td className="px-6 py-3 text-right text-slate-300">{c.citas}</td>
                  <td className="px-6 py-3 text-right text-slate-500 text-xs whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <CopiarUrlButton slug={c.slug} platformDomain={platformDomain} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
