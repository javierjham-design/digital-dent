import { fmtMonto } from '@/lib/money'

const fmt = fmtMonto
const hora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })

// Movimiento de caja tal como lo devuelve detalleSesion / movimientos del backend.
export interface FlujoMovimiento {
  id: string; tipo: string; monto: number; descripcion: string; categoria: string | null
  fecha: string; anulado: boolean
  user?: { name: string | null } | null
  cobro?: { id?: string; numero?: number; monto?: number; paciente?: { nombre: string; apellido: string } | null; medioPago?: { nombre: string | null } | null } | null
}
// La caja muestra lo EXACTAMENTE cobrado (bruto). Si el movimiento viene de un
// cobro, se usa el monto bruto del cobro (sin la retención del medio de pago).
const brutoDe = (m: FlujoMovimiento) => m.cobro?.monto ?? m.monto
export interface FlujoResumen {
  ingresos: number; egresos: number; ingresosEfectivo?: number
  porMetodo?: { metodo: string; monto: number; cantidad: number }[]
}

// El medio de pago de un movimiento: el del cobro, o "Efectivo" si no tiene medio.
const metodoDe = (m: FlujoMovimiento) => m.cobro?.medioPago?.nombre || 'Efectivo'

// Flujo de la caja: la lista ORDENADA de pagos recibidos (con paciente y medio)
// y de egresos, con los totales por medio de pago. Es el historial transparente
// de todo lo que entró y salió durante el período.
export function FlujoCaja({ movimientos, resumen }: { movimientos: FlujoMovimiento[]; resumen: FlujoResumen | null }) {
  const asc = [...movimientos].sort((a, b) => +new Date(a.fecha) - +new Date(b.fecha))
  const pagos = asc.filter((m) => m.tipo === 'INGRESO')
  const egresos = asc.filter((m) => m.tipo === 'EGRESO')
  const porMetodo = (resumen?.porMetodo ?? []).filter((x) => x.monto > 0)
  const recaudacion = resumen?.ingresos ?? pagos.filter((m) => !m.anulado).reduce((s, m) => s + brutoDe(m), 0)
  const totalEgresos = resumen?.egresos ?? egresos.filter((m) => !m.anulado).reduce((s, m) => s + m.monto, 0)

  return (
    <div className="space-y-4">
      {/* Pagos recibidos */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-sm font-semibold text-slate-700">Pagos recibidos ({pagos.length})</p>
          <p className="text-sm font-bold font-mono text-emerald-600">{fmt(recaudacion)}</p>
        </div>
        {porMetodo.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {porMetodo.map((x) => (
              <span key={x.metodo} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {x.metodo}: <span className="font-semibold font-mono">{fmt(x.monto)}</span> <span className="text-slate-400">({x.cantidad})</span>
              </span>
            ))}
          </div>
        )}
        {pagos.length === 0 ? <p className="text-xs text-slate-400 py-1">No se recibieron pagos en este período.</p> : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {pagos.map((m) => (
              <div key={m.id} className={`flex items-center justify-between gap-2 px-3 py-2 ${m.anulado ? 'opacity-40 line-through' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 truncate">{m.descripcion}</p>
                  <p className="text-[11px] text-slate-400">{hora(m.fecha)} · {metodoDe(m)}{m.user?.name ? ` · ${m.user.name}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!m.anulado && m.cobro?.id && <a href={`/print/cobro/${m.cobro.id}`} target="_blank" rel="noopener noreferrer" title="Imprimir comprobante" className="text-slate-400 hover:text-slate-700 text-sm">🖨</a>}
                  <span className="font-mono text-sm font-semibold text-emerald-600">+{fmt(brutoDe(m))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Egresos / gastos */}
      {egresos.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-sm font-semibold text-slate-700">Egresos / gastos ({egresos.length})</p>
            <p className="text-sm font-bold font-mono text-rose-600">−{fmt(totalEgresos)}</p>
          </div>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {egresos.map((m) => (
              <div key={m.id} className={`flex items-center justify-between gap-2 px-3 py-2 ${m.anulado ? 'opacity-40 line-through' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 truncate">{m.descripcion}</p>
                  <p className="text-[11px] text-slate-400">{hora(m.fecha)}{m.categoria ? ` · ${m.categoria}` : ''}{m.user?.name ? ` · ${m.user.name}` : ''}</p>
                </div>
                <span className="font-mono text-sm font-semibold text-rose-600 shrink-0">−{fmt(m.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
