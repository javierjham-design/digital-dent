import { useEffect, useState } from 'react'
import type { LiquidacionActivaDetalle } from '@shared/types'
import { liquidacionesService } from '@/services/caja.service'
import { useAuth } from '@/hooks/useAuth'

interface LiqFin {
  id: string; periodo: string; totalBruto: number; totalLiquidado: number; estado: string; fechaPago: string | null
  _count?: { items: number }
}
interface LiqFinItem { id: string; prestacionNombre: string; pacienteNombre: string; diente: string | null; medioPago: string | null; montoPagado: number; comisionAplicada: number; montoLiquidado: number }
interface LiqFinDetalle extends LiqFin { items: LiqFinItem[]; doctor?: { name: string | null; rut: string | null } }

const fmt = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n))
const fmtFecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const ESTADO_LABEL: Record<string, string> = { BORRADOR: 'Borrador', APROBADA: 'Aprobada', PAGADA: 'Pagada' }
const ESTADO_COLOR: Record<string, string> = { BORRADOR: 'bg-slate-200 text-slate-600', APROBADA: 'bg-cyan-100 text-cyan-700', PAGADA: 'bg-emerald-100 text-emerald-700' }

export function MisLiquidaciones() {
  const { user } = useAuth()
  const [activa, setActiva] = useState<LiquidacionActivaDetalle | null>(null)
  const [finalizadas, setFinalizadas] = useState<LiqFin[]>([])
  const [detalle, setDetalle] = useState<LiqFinDetalle | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      liquidacionesService.activa(user.id).then(setActiva).catch(() => setActiva(null)),
      liquidacionesService.listar().then((l) => setFinalizadas(l as LiqFin[])).catch(() => {}),
    ]).finally(() => setCargando(false))
  }, [user])

  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-5">Mis liquidaciones</h1>

      {/* Liquidación abierta (en curso) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">Liquidación abierta (en curso)</h2>
            <span className="text-xs font-semibold rounded-lg px-2 py-0.5 bg-amber-100 text-amber-700">Abierta</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">Realizado <b className="font-mono text-slate-700">{fmt(activa?.realizado ?? 0)}</b></span>
            <span className="text-slate-500">A pagar <b className="font-mono text-cyan-700">{fmt(activa?.aPagar ?? 0)}</b></span>
          </div>
        </div>
        {!activa?.contrato ? (
          <p className="text-sm text-slate-500">Aún no tienes un contrato activo configurado. Consultá con administración.</p>
        ) : (activa.items.length === 0) ? (
          <p className="text-sm text-slate-500">No tienes acciones pendientes de liquidar.</p>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Paciente</th>
                  <th className="text-left font-medium px-3 py-2">Acción</th>
                  <th className="text-right font-medium px-3 py-2">Monto</th>
                  <th className="text-left font-medium px-3 py-2">Medio pago</th>
                  <th className="text-right font-medium px-3 py-2">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activa.items.map((it) => (
                  <tr key={it.tratamientoId} className={it.pagada ? '' : 'bg-rose-50/40'}>
                    <td className="px-3 py-2 text-slate-800">{it.pacienteNombre}</td>
                    <td className="px-3 py-2 text-slate-700">{it.accion}{it.pieza ? <span className="text-xs text-slate-400"> · {it.pieza}</span> : ''}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(it.monto)}</td>
                    <td className="px-3 py-2 text-slate-500">{it.medioPago}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${it.pagada ? 'text-slate-800' : 'text-rose-500'}`}>{fmt(it.total)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${it.pagada ? 'bg-emerald-500' : 'bg-rose-500'}`} title={it.pagada ? 'Pagada' : 'Pendiente de pago del paciente'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">🟢 Pagada por el paciente (se te liquida) · 🔴 evolucionada pero aún sin pago (no suma hasta que el paciente pague).</p>
      </div>

      {/* Liquidaciones emitidas */}
      <h2 className="text-base font-semibold text-slate-800 mb-3">Liquidaciones emitidas</h2>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {finalizadas.length === 0 ? (
          <p className="px-5 py-8 text-center text-slate-500 text-sm">Todavía no tienes liquidaciones emitidas.</p>
        ) : finalizadas.map((l) => (
          <button key={l.id} onClick={async () => setDetalle(await liquidacionesService.obtener(l.id) as LiqFinDetalle)}
            className="w-full flex items-center justify-between px-5 py-3.5 gap-3 hover:bg-slate-50 text-left">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-cyan-800">{l.periodo}</p>
              <p className="text-xs text-slate-500">{l._count?.items ?? 0} acción(es) · {fmt(l.totalLiquidado)}{l.estado === 'PAGADA' && l.fechaPago ? ` · pagada el ${fmtFecha(l.fechaPago)}` : ''}</p>
            </div>
            <span className={`text-xs font-semibold rounded-lg px-2 py-1 ${ESTADO_COLOR[l.estado] ?? ''}`}>{ESTADO_LABEL[l.estado] ?? l.estado}</span>
          </button>
        ))}
      </div>

      {detalle && <DetalleModal liq={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}

function DetalleModal({ liq, onClose }: { liq: LiqFinDetalle; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-900">Liquidación · {liq.periodo}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className={`text-xs font-semibold rounded-lg px-2 py-0.5 ${ESTADO_COLOR[liq.estado] ?? ''}`}>{ESTADO_LABEL[liq.estado] ?? liq.estado}</span>
          {liq.estado === 'PAGADA' && liq.fechaPago && <span className="text-xs text-slate-500">Pagada el {fmtFecha(liq.fechaPago)}</span>}
        </div>
        <div className="flex justify-end gap-4 text-sm mb-3">
          <span className="text-slate-500">Pagado por pacientes <b className="font-mono">{fmt(liq.totalBruto)}</b></span>
          <span className="text-slate-500 font-semibold">A pagar <b className="font-mono text-cyan-700">{fmt(liq.totalLiquidado)}</b></span>
        </div>
        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2">Paciente</th>
                <th className="text-left font-medium px-3 py-2">Acción</th>
                <th className="text-left font-medium px-3 py-2">Medio pago</th>
                <th className="text-right font-medium px-3 py-2">Pagado</th>
                <th className="text-right font-medium px-3 py-2">Comisión</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liq.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-slate-800">{it.pacienteNombre}</td>
                  <td className="px-3 py-2 text-slate-700">{it.prestacionNombre}{it.diente ? <span className="text-xs text-slate-400"> · {it.diente}</span> : ''}</td>
                  <td className="px-3 py-2 text-slate-500">{it.medioPago ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(it.montoPagado)}</td>
                  <td className="px-3 py-2 text-right font-mono text-rose-500">−{fmt(it.comisionAplicada)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{fmt(it.montoLiquidado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
