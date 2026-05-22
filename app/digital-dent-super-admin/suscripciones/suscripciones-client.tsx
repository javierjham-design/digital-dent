'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ESTADO_PAGO_LABEL, type EstadoPago } from '@/lib/billing'

type ClinicaItem = {
  id: string
  slug: string
  nombre: string
  plan: string
  activo: boolean
  trialHasta: string | null
  proximoCobro: string | null
  precioAcordado: number | null
  precioMensual: number
  cicloFacturacion: string | null
  estado: EstadoPago
  ultimoPago: { fecha: string; monto: number } | null
  createdAt: string
}

type Kpis = {
  totalClinicas: number
  mrr: number
  arr: number
  alDia: number
  atrasadas: number
  enTrial: number
  suspendidas: number
  trialsPorVencer: number
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

const diasHasta = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

const ESTADO_COLOR: Record<EstadoPago, string> = {
  TRIAL: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  AL_DIA: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  ATRASADO: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  SUSPENDIDO: 'bg-slate-700 text-slate-300 border border-slate-600',
}

const FILTROS: { id: 'TODAS' | EstadoPago; label: string }[] = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'AL_DIA', label: 'Al día' },
  { id: 'ATRASADO', label: 'Atrasadas' },
  { id: 'TRIAL', label: 'En trial' },
  { id: 'SUSPENDIDO', label: 'Suspendidas' },
]

export function SuscripcionesClient({ kpis, clinicas }: { kpis: Kpis; clinicas: ClinicaItem[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('TODAS')
  const [q, setQ] = useState('')

  const filtradas = useMemo(() => {
    const qLower = q.trim().toLowerCase()
    return clinicas.filter((c) => {
      if (filtro !== 'TODAS' && c.estado !== filtro) return false
      if (qLower && !c.nombre.toLowerCase().includes(qLower) && !c.slug.toLowerCase().includes(qLower)) return false
      return true
    })
  }, [clinicas, filtro, q])

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Suscripciones</h1>
        <p className="text-slate-400 mt-1 text-sm">Gestión económica de las clínicas: planes, pagos y estado de cuenta.</p>
      </div>

      {/* KPIs financieros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-emerald-300/80">MRR · Ingresos mensuales</p>
          <p className="text-4xl font-bold mt-2 text-white">{fmtCLP(kpis.mrr)}</p>
          <p className="text-xs text-emerald-300/70 mt-2">Clínicas al día con plan pagado</p>
        </div>
        <div className="bg-gradient-to-br from-sky-500/10 to-indigo-500/10 border border-sky-500/30 rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-sky-300/80">ARR estimado</p>
          <p className="text-4xl font-bold mt-2 text-white">{fmtCLP(kpis.arr)}</p>
          <p className="text-xs text-sky-300/70 mt-2">MRR × 12 a tarifa actual</p>
        </div>
      </div>

      {/* KPIs estado */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <KpiBox label="Total clínicas" value={kpis.totalClinicas} color="slate" />
        <KpiBox label="Al día" value={kpis.alDia} color="emerald" />
        <KpiBox label="Atrasadas" value={kpis.atrasadas} color="rose" />
        <KpiBox label="En trial" value={kpis.enTrial} color="blue" />
        <KpiBox label="Trials por vencer (7d)" value={kpis.trialsPorVencer} color="amber" />
      </div>

      {/* Filtros + búsqueda */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtro === f.id
                ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar clínica..."
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500 bg-slate-900/50">
              <th className="text-left px-6 py-3">Clínica</th>
              <th className="text-left px-6 py-3">Plan</th>
              <th className="text-left px-6 py-3">Estado</th>
              <th className="text-right px-6 py-3">Precio mensual</th>
              <th className="text-right px-6 py-3">Próximo cobro</th>
              <th className="text-right px-6 py-3">Último pago</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-sm">Sin clínicas que coincidan</td>
              </tr>
            ) : (
              filtradas.map((c) => {
                const dias = diasHasta(c.estado === 'TRIAL' ? c.trialHasta : c.proximoCobro)
                const refLabel = c.estado === 'TRIAL' ? c.trialHasta : c.proximoCobro
                return (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-3">
                      <Link
                        href={`/digital-dent-super-admin/clinicas/${c.id}`}
                        className="text-white font-medium hover:text-purple-300"
                      >
                        {c.nombre}
                      </Link>
                      <p className="text-xs text-slate-500 font-mono">{c.slug}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">{c.plan}</span>
                      {c.cicloFacturacion === 'ANUAL' && (
                        <span className="ml-1.5 text-[10px] text-slate-500">anual</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[c.estado]}`}>
                        {ESTADO_PAGO_LABEL[c.estado]}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-200 font-mono">
                      {c.plan === 'TRIAL' ? <span className="text-slate-500">—</span> : fmtCLP(c.precioMensual)}
                      {c.precioAcordado != null && c.plan !== 'TRIAL' && (
                        <p className="text-[10px] text-purple-300/70">acordado</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">
                      {refLabel ? (
                        <div>
                          <p>{fmtFecha(refLabel)}</p>
                          {dias != null && (
                            <p className={`text-[10px] ${dias < 0 ? 'text-rose-300' : dias <= 7 ? 'text-amber-300' : 'text-slate-500'}`}>
                              {dias < 0 ? `Hace ${Math.abs(dias)}d` : dias === 0 ? 'Hoy' : `En ${dias}d`}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">
                      {c.ultimoPago ? (
                        <div>
                          <p className="font-mono text-xs">{fmtCLP(c.ultimoPago.monto)}</p>
                          <p className="text-[10px] text-slate-500">{fmtFecha(c.ultimoPago.fecha)}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">Sin pagos</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/digital-dent-super-admin/clinicas/${c.id}`}
                        className="text-xs text-purple-300 hover:text-purple-200"
                      >
                        Gestionar →
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function KpiBox({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-800/50 border-slate-700 text-slate-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    rose: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1 text-white">{value}</p>
    </div>
  )
}
