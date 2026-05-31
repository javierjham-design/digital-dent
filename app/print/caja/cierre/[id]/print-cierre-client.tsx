'use client'

import { formatCLP, formatDate, formatDateTime, formatRUT } from '@/lib/utils'
import { PrintPlanButton } from '../../../plan/print-button'

interface ClinicaInfo {
  nombre: string; direccion: string; ciudad: string; telefono: string; email: string
  rut: string | null; logoUrl: string | null
}

interface SesionInfo {
  id: string; estado: string
  abiertaAt: string; cerradaAt: string | null
  abiertaPorNombre: string | null; cerradaPorNombre: string | null
  saldoApertura: number
  saldoEsperado: number | null; saldoReal: number | null; diferencia: number | null
  totalIngresos: number | null; totalEgresos: number | null
  observaciones: string | null
  caja: { id: string; nombre: string; descripcion: string | null }
}

interface AggRow { label: string; monto: number }
interface MovRow {
  id: string; tipo: string; monto: number; descripcion: string; categoria: string | null
  fecha: string; anulado: boolean; motivoAnulacion: string | null
  cobroNumero: number | null; userNombre: string | null
}

const CATEGORIA_LABEL: Record<string, string> = {
  ARRIENDO: 'Arriendo',
  INSUMOS: 'Insumos',
  SUELDO: 'Sueldos',
  SERVICIOS: 'Servicios',
  RETIRO: 'Retiros',
  COBRO: 'Cobros pacientes',
  OTRO: 'Otros',
}

export function PrintCierreClient({
  clinica, sesion, ingresosPorMedio, egresosPorCategoria, movimientos,
}: {
  clinica: ClinicaInfo | null
  sesion: SesionInfo
  ingresosPorMedio: AggRow[]
  egresosPorCategoria: AggRow[]
  movimientos: MovRow[]
}) {
  const isCerrada = sesion.estado === 'CERRADA'
  const ingresos = sesion.totalIngresos ?? ingresosPorMedio.reduce((s, r) => s + r.monto, 0)
  const egresos  = sesion.totalEgresos  ?? egresosPorCategoria.reduce((s, r) => s + r.monto, 0)
  const esperado = sesion.saldoEsperado ?? (sesion.saldoApertura + ingresos - egresos)
  const real     = sesion.saldoReal ?? esperado
  const diff     = sesion.diferencia ?? (real - esperado)

  return (
    <div className="min-h-screen bg-white">
      <PrintPlanButton />
      <div id="print-area" className="max-w-[820px] mx-auto px-8 py-10 text-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5 mb-6">
          <div className="flex items-start gap-3">
            {clinica?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinica.logoUrl} alt="Logo" className="w-14 h-14 object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{clinica?.nombre ?? 'Clínica'}</h1>
              <p className="text-slate-500 text-xs mt-0.5">
                {clinica?.direccion}{clinica?.ciudad ? `, ${clinica.ciudad}` : ''}
              </p>
              <p className="text-slate-500 text-xs">
                {clinica?.telefono}{clinica?.email ? ` · ${clinica.email}` : ''}
              </p>
              {clinica?.rut && <p className="text-slate-500 text-xs">RUT: {formatRUT(clinica.rut)}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Cierre de caja</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{sesion.caja.nombre}</p>
            <p className="text-xs text-slate-500">{isCerrada ? 'Cerrada' : 'Sesión en curso'}</p>
          </div>
        </div>

        {/* Período */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">Apertura</p>
            <p className="text-sm text-slate-800 mt-0.5">{formatDateTime(sesion.abiertaAt)}</p>
            <p className="text-xs text-slate-500">{sesion.abiertaPorNombre ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">Cierre</p>
            <p className="text-sm text-slate-800 mt-0.5">{sesion.cerradaAt ? formatDateTime(sesion.cerradaAt) : '— en curso —'}</p>
            <p className="text-xs text-slate-500">{sesion.cerradaPorNombre ?? '—'}</p>
          </div>
        </div>

        {/* Cuadre */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">Cuadre de caja</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-200 text-sm">
            <div className="p-4 space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Saldo apertura</span><span className="font-mono">{formatCLP(sesion.saldoApertura)}</span></div>
              <div className="flex justify-between text-emerald-700"><span>+ Ingresos</span><span className="font-mono">{formatCLP(ingresos)}</span></div>
              <div className="flex justify-between text-rose-700"><span>− Egresos</span><span className="font-mono">{formatCLP(egresos)}</span></div>
              <div className="flex justify-between font-bold border-t border-slate-200 pt-1.5">
                <span>Saldo esperado</span>
                <span className="font-mono">{formatCLP(esperado)}</span>
              </div>
            </div>
            <div className="p-4 space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Conteo real</span><span className="font-mono font-bold">{formatCLP(real)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Saldo esperado</span><span className="font-mono">{formatCLP(esperado)}</span></div>
              <div className={`flex justify-between border-t border-slate-200 pt-1.5 font-bold ${diff === 0 ? 'text-slate-700' : diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                <span>Diferencia</span>
                <span className="font-mono">{diff > 0 ? '+' : ''}{formatCLP(diff)}</span>
              </div>
              <p className="text-[10px] text-slate-500">
                {diff === 0 ? 'Cuadre exacto.' : diff > 0 ? 'Sobrante respecto a lo esperado.' : 'Faltante respecto a lo esperado.'}
              </p>
            </div>
          </div>
        </div>

        {/* Breakdowns */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-slate-200 rounded-lg">
            <div className="px-3 py-2 bg-emerald-50 border-b border-slate-200">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-emerald-700">Ingresos por medio</p>
            </div>
            {ingresosPorMedio.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 italic">Sin ingresos.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {ingresosPorMedio.map(r => (
                    <tr key={r.label}>
                      <td className="px-3 py-1.5 text-slate-700">{r.label}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-700">{formatCLP(r.monto)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-3 py-1.5 font-bold text-slate-700">Total</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">{formatCLP(ingresos)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          <div className="border border-slate-200 rounded-lg">
            <div className="px-3 py-2 bg-rose-50 border-b border-slate-200">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-rose-700">Egresos por categoría</p>
            </div>
            {egresosPorCategoria.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 italic">Sin egresos.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {egresosPorCategoria.map(r => (
                    <tr key={r.label}>
                      <td className="px-3 py-1.5 text-slate-700">{CATEGORIA_LABEL[r.label] ?? r.label}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-rose-700">{formatCLP(r.monto)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-3 py-1.5 font-bold text-slate-700">Total</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-rose-700">{formatCLP(egresos)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Movimientos */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">Detalle de movimientos · {movimientos.length}</p>
          </div>
          {movimientos.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400 italic text-center">Sin movimientos en este período.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                  <th className="text-left px-3 py-1.5">Fecha</th>
                  <th className="text-left px-3 py-1.5">Descripción</th>
                  <th className="text-left px-3 py-1.5">Cat.</th>
                  <th className="text-left px-3 py-1.5">Usuario</th>
                  <th className="text-right px-3 py-1.5">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientos.map(m => (
                  <tr key={m.id} className={m.anulado ? 'text-slate-400 line-through bg-slate-50' : ''}>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{formatDateTime(m.fecha)}</td>
                    <td className="px-3 py-1.5">
                      {m.descripcion}
                      {m.cobroNumero && <span className="text-slate-400"> · #{m.cobroNumero}</span>}
                      {m.anulado && m.motivoAnulacion && <p className="text-[10px] text-rose-500 not-italic no-underline">Motivo: {m.motivoAnulacion}</p>}
                    </td>
                    <td className="px-3 py-1.5">{m.categoria ? (CATEGORIA_LABEL[m.categoria] ?? m.categoria) : '—'}</td>
                    <td className="px-3 py-1.5 truncate max-w-[100px]">{m.userNombre ?? '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${m.anulado ? '' : m.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {m.tipo === 'INGRESO' ? '+' : '−'} {formatCLP(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {sesion.observaciones && (
          <div className="border border-slate-200 rounded-lg p-3 mb-6">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">Observaciones</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sesion.observaciones}</p>
          </div>
        )}

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-12 mt-10">
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2 text-xs text-slate-500">
              Firma de quien cierra<br />
              <span className="text-slate-700">{sesion.cerradaPorNombre ?? sesion.abiertaPorNombre ?? '—'}</span>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2 text-xs text-slate-500">Firma supervisor / administrador</div>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-8">
          Documento generado por {clinica?.nombre ?? 'la clínica'} · {formatDate(new Date().toISOString())}
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  )
}
