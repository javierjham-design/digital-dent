'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCLP, formatDate, formatDateTime } from '@/lib/utils'
import { CobrosSubNav } from '../../../../sub-nav'

interface Movimiento {
  id: string
  tipo: string
  monto: number
  descripcion: string
  categoria: string | null
  fecha: string
  anulado: boolean
  motivoAnulacion: string | null
  cobroId: string | null
  cobroNumero: number | null
  cobroBruto: number | null
  cobroComision: number | null
  medioPagoNombre: string | null
  pacienteNombre: string | null
  userNombre: string | null
}

interface SesionInfo {
  id: string
  estado: string
  abiertaAt: string
  cerradaAt: string | null
  abiertaPorNombre: string | null
  cerradaPorNombre: string | null
  saldoApertura: number
  saldoEsperado: number | null
  saldoReal: number | null
  diferencia: number | null
  totalIngresos: number | null
  totalEgresos: number | null
  observaciones: string | null
}

const PAGE_SIZE = 25

export function SesionDetalleClient({
  caja, sesion, movimientos,
}: {
  caja: { id: string; nombre: string }
  sesion: SesionInfo
  movimientos: Movimiento[]
}) {
  const [page, setPage] = useState(0)
  const isCerrada = sesion.estado === 'CERRADA'

  const totalPages = Math.max(1, Math.ceil(movimientos.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pagedMovs = movimientos.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Resumen por medio de pago (ingresos no anulados).
  const resumenPorMedio = useMemo(() => {
    const map = new Map<string, { monto: number; cantidad: number }>()
    for (const m of movimientos) {
      if (m.anulado || m.tipo !== 'INGRESO') continue
      const k = m.cobroId
        ? (m.medioPagoNombre ?? 'Sin medio')
        : (m.categoria ?? 'Ajuste')
      const cur = map.get(k) ?? { monto: 0, cantidad: 0 }
      map.set(k, { monto: cur.monto + m.monto, cantidad: cur.cantidad + 1 })
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientos])

  // Resumen por categoría (egresos no anulados).
  const resumenPorCategoria = useMemo(() => {
    const map = new Map<string, { monto: number; cantidad: number }>()
    for (const m of movimientos) {
      if (m.anulado || m.tipo !== 'EGRESO') continue
      const k = m.categoria ?? 'OTRO'
      const cur = map.get(k) ?? { monto: 0, cantidad: 0 }
      map.set(k, { monto: cur.monto + m.monto, cantidad: cur.cantidad + 1 })
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientos])

  const totalIngresos = sesion.totalIngresos ?? resumenPorMedio.reduce((s, r) => s + r.monto, 0)
  const totalEgresos = sesion.totalEgresos ?? resumenPorCategoria.reduce((s, r) => s + r.monto, 0)
  const saldoEsperado = sesion.saldoEsperado ?? (sesion.saldoApertura + totalIngresos - totalEgresos)
  const diff = sesion.diferencia ?? 0

  const cobrosBruto = useMemo(() => movimientos
    .filter(m => !m.anulado && m.tipo === 'INGRESO' && m.cobroId)
    .reduce((s, m) => s + (m.cobroBruto ?? m.monto), 0), [movimientos])
  const cobrosComision = useMemo(() => movimientos
    .filter(m => !m.anulado && m.tipo === 'INGRESO' && m.cobroId)
    .reduce((s, m) => s + (m.cobroComision ?? 0), 0), [movimientos])

  return (
    <div className="p-8">
      <CobrosSubNav />

      <div className="mb-5">
        <Link href={`/cobros/caja/${caja.id}`} className="text-xs text-cyan-600 hover:underline">← Volver a {caja.nombre}</Link>
        <div className="flex items-start justify-between gap-3 mt-1 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">Sesión {isCerrada ? 'cerrada' : 'abierta'}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${isCerrada ? 'bg-slate-200 text-slate-800' : 'bg-emerald-100 text-emerald-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isCerrada ? 'bg-slate-500' : 'bg-emerald-500 animate-pulse'}`} />
                {isCerrada ? 'CERRADA' : 'ABIERTA'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {formatDateTime(sesion.abiertaAt)}
              {sesion.abiertaPorNombre ? ` · abrió ${sesion.abiertaPorNombre}` : ''}
              {sesion.cerradaAt ? ` → ${formatDateTime(sesion.cerradaAt)}` : ''}
              {sesion.cerradaPorNombre ? ` · cerró ${sesion.cerradaPorNombre}` : ''}
            </p>
          </div>
          <a href={`/print/caja/cierre/${sesion.id}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-sm font-medium shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir reporte
          </a>
        </div>
      </div>

      {/* Cuadre */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Cuadre de caja</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Apertura</p>
            <p className="font-mono text-slate-800 mt-1">{formatCLP(sesion.saldoApertura)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-emerald-700 uppercase">Ingresos</p>
            <p className="font-mono text-emerald-800 mt-1">{formatCLP(totalIngresos)}</p>
          </div>
          <div className="bg-rose-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-rose-700 uppercase">Egresos</p>
            <p className="font-mono text-rose-800 mt-1">{formatCLP(totalEgresos)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase">Esperado</p>
            <p className="font-mono text-slate-800 mt-1">{formatCLP(saldoEsperado)}</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 text-white">
            <p className="text-[10px] font-semibold text-slate-400 uppercase">Saldo real</p>
            <p className="font-mono mt-1">{isCerrada ? formatCLP(sesion.saldoReal ?? 0) : '—'}</p>
            {isCerrada && diff !== 0 && (
              <p className={`text-[10px] mt-0.5 ${diff > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                Dif {diff > 0 ? '+' : ''}{formatCLP(diff)} {diff > 0 ? '(sobrante)' : '(faltante)'}
              </p>
            )}
            {isCerrada && diff === 0 && (
              <p className="text-[10px] text-emerald-300 mt-0.5">Cuadre exacto</p>
            )}
          </div>
        </div>
        {sesion.observaciones && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Observaciones del cierre</p>
            <p className="text-sm text-slate-700 italic">{sesion.observaciones}</p>
          </div>
        )}
      </div>

      {/* Resúmenes */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-emerald-50">
            <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wide">Ingresos por medio de pago</p>
          </div>
          {resumenPorMedio.length === 0 ? (
            <p className="p-6 text-xs text-slate-400 text-center">Sin ingresos en esta sesión.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {resumenPorMedio.map(r => (
                  <tr key={r.label}>
                    <td className="px-4 py-2 text-slate-700">{r.label}</td>
                    <td className="px-4 py-2 text-right text-xs text-slate-400">{r.cantidad} mov.</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-700 font-semibold">{formatCLP(r.monto)}</td>
                  </tr>
                ))}
                <tr className="bg-emerald-50/60">
                  <td className="px-4 py-2 text-xs font-semibold text-slate-700" colSpan={2}>Total ingresos netos</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-800 font-bold">{formatCLP(totalIngresos)}</td>
                </tr>
                {cobrosBruto > 0 && cobrosBruto !== totalIngresos && (
                  <>
                    <tr>
                      <td className="px-4 py-2 text-[11px] text-slate-500" colSpan={2}>Bruto cobros (antes de comisión)</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">{formatCLP(cobrosBruto)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-[11px] text-slate-500" colSpan={2}>Comisiones medios de pago</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-rose-500">− {formatCLP(cobrosComision)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-rose-50">
            <p className="text-xs font-semibold text-rose-900 uppercase tracking-wide">Egresos por categoría</p>
          </div>
          {resumenPorCategoria.length === 0 ? (
            <p className="p-6 text-xs text-slate-400 text-center">Sin egresos en esta sesión.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {resumenPorCategoria.map(r => (
                  <tr key={r.label}>
                    <td className="px-4 py-2 text-slate-700">{r.label}</td>
                    <td className="px-4 py-2 text-right text-xs text-slate-400">{r.cantidad} mov.</td>
                    <td className="px-4 py-2 text-right font-mono text-rose-700 font-semibold">{formatCLP(r.monto)}</td>
                  </tr>
                ))}
                <tr className="bg-rose-50/60">
                  <td className="px-4 py-2 text-xs font-semibold text-slate-700" colSpan={2}>Total egresos</td>
                  <td className="px-4 py-2 text-right font-mono text-rose-800 font-bold">{formatCLP(totalEgresos)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Movimientos */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-900 text-sm">
            Movimientos <span className="text-slate-400 font-normal">· {movimientos.length}</span>
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-slate-500">
              Página <span className="font-semibold text-slate-700">{safePage + 1}</span> de <span className="font-semibold text-slate-700">{totalPages}</span>
            </span>
          )}
        </div>
        {movimientos.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">Sin movimientos en esta sesión.</div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Descripción</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Medio/Cat.</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Usuario</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedMovs.map(m => (
                    <tr key={m.id} className={m.anulado ? 'bg-slate-50 text-slate-400 line-through' : ''}>
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{formatDateTime(m.fecha)}</td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-800 font-medium">{m.descripcion}</p>
                        {m.cobroNumero && (
                          <p className="text-[11px] text-slate-400">
                            Cobro #{m.cobroNumero}{m.pacienteNombre ? ` · ${m.pacienteNombre}` : ''}
                          </p>
                        )}
                        {m.anulado && m.motivoAnulacion && (
                          <p className="text-[11px] text-rose-500 not-italic no-underline">Motivo: {m.motivoAnulacion}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {m.tipo === 'INGRESO'
                          ? (m.medioPagoNombre ?? (m.cobroId ? 'Sin medio' : (m.categoria ?? '—')))
                          : (m.categoria ?? '—')}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 truncate max-w-[120px]">{m.userNombre ?? '—'}</td>
                      <td className={`px-4 py-2.5 text-right text-sm font-bold font-mono ${m.anulado ? '' : m.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {m.tipo === 'INGRESO' ? '+ ' : '- '}{formatCLP(m.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(0)} disabled={safePage === 0}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    « Primero
                  </button>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    ← Anterior
                  </button>
                </div>
                <span className="text-xs text-slate-500">
                  Mostrando {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, movimientos.length)} de {movimientos.length}
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    Siguiente →
                  </button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={safePage === totalPages - 1}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    Último »
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] text-slate-400 mt-4 text-center">
        Esta vista es de solo lectura. Los movimientos quedan congelados con el cierre para preservar la trazabilidad.
      </p>
    </div>
  )
}
