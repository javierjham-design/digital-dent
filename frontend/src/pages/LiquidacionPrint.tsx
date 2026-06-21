import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { liquidacionesService } from '@/services/caja.service'
import { api } from '@/services/api'

const fmt = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n))
const fmtFecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const ESTADO_LABEL: Record<string, string> = { BORRADOR: 'Abierta', APROBADA: 'Aprobada', PAGADA: 'Pagada' }

interface Item { id: string; prestacionNombre: string; pacienteNombre: string; diente: string | null; medioPago: string | null; montoPagado: number; comisionAplicada: number; montoLiquidado: number }
interface Adj { id: string; tipo: string; nombre: string }
interface Detalle {
  id: string; periodo: string; estado: string; fechaPago: string | null; totalBruto: number; totalLiquidado: number
  doctor?: { name: string | null; rut: string | null; especialidad: string | null }
  contrato?: { tipo: string; porcentaje: number | null; montoFijo: number | null } | null
  items: Item[]; adjuntos?: Adj[]
}

export function LiquidacionPrint() {
  const { id } = useParams()
  const [liq, setLiq] = useState<Detalle | null>(null)
  const [clinica, setClinica] = useState<{ nombre?: string } | null>(null)

  useEffect(() => {
    if (!id) return
    liquidacionesService.obtener(id).then((d) => setLiq(d as Detalle)).catch(() => {})
    api.get<{ nombre?: string }>('/clinica').then(setClinica).catch(() => {})
  }, [id])

  if (!liq) return <p style={{ padding: 24 }}>Cargando…</p>

  const contratoTxt = liq.contrato
    ? liq.contrato.tipo === 'PORCENTAJE' ? `${liq.contrato.porcentaje}% por acción` : `${fmt(liq.contrato.montoFijo ?? 0)} fijo por acción`
    : '—'

  return (
    <div className="max-w-3xl mx-auto p-8 text-slate-800 text-sm">
      <div className="print:hidden mb-6 flex justify-between items-center">
        <span className="text-slate-400 text-xs">Vista para imprimir / guardar como PDF</span>
        <button onClick={() => window.print()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-semibold">Imprimir / Guardar PDF</button>
      </div>

      <header className="flex items-start justify-between border-b border-slate-200 pb-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{clinica?.nombre ?? 'Cláriva'}</h1>
          <p className="text-slate-500">Liquidación de honorarios profesionales</p>
        </div>
        <div className="text-right">
          <span className={`inline-block text-xs font-semibold rounded px-2 py-1 ${liq.estado === 'PAGADA' ? 'bg-emerald-100 text-emerald-700' : liq.estado === 'APROBADA' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-200 text-slate-600'}`}>
            {ESTADO_LABEL[liq.estado] ?? liq.estado}
          </span>
          {liq.estado === 'PAGADA' && liq.fechaPago && <p className="text-xs text-slate-500 mt-1">Pagada el {fmtFecha(liq.fechaPago)}</p>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-y-1 gap-x-6 mb-5">
        <div><span className="text-slate-400">Profesional:</span> <b>{liq.doctor?.name ?? '—'}</b></div>
        <div><span className="text-slate-400">RUT:</span> {liq.doctor?.rut ?? '—'}</div>
        <div><span className="text-slate-400">Especialidad:</span> {liq.doctor?.especialidad ?? '—'}</div>
        <div><span className="text-slate-400">Emisión:</span> {liq.periodo}</div>
        <div><span className="text-slate-400">Contrato:</span> {contratoTxt}</div>
      </div>

      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-500">
            <th className="py-1.5">Paciente</th>
            <th className="py-1.5">Acción</th>
            <th className="py-1.5">Medio pago</th>
            <th className="py-1.5 text-right">Pagado</th>
            <th className="py-1.5 text-right">Comisión</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {liq.items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="py-1.5">{it.pacienteNombre}</td>
              <td className="py-1.5">{it.prestacionNombre}{it.diente ? ` · ${it.diente}` : ''}</td>
              <td className="py-1.5">{it.medioPago ?? '—'}</td>
              <td className="py-1.5 text-right font-mono">{fmt(it.montoPagado)}</td>
              <td className="py-1.5 text-right font-mono">−{fmt(it.comisionAplicada)}</td>
              <td className="py-1.5 text-right font-mono font-semibold">{fmt(it.montoLiquidado)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end gap-8 border-t-2 border-slate-300 pt-3">
        <div className="text-right"><p className="text-slate-400 text-xs">Pagado por pacientes</p><p className="font-mono">{fmt(liq.totalBruto)}</p></div>
        <div className="text-right"><p className="text-slate-400 text-xs">Total a pagar al profesional</p><p className="font-mono text-lg font-bold">{fmt(liq.totalLiquidado)}</p></div>
      </div>

      {liq.adjuntos && liq.adjuntos.length > 0 && (
        <div className="mt-6 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">Documentos adjuntos</p>
          <ul className="list-disc pl-5">
            {liq.adjuntos.map((a) => <li key={a.id}>{a.tipo === 'FACTURA' ? 'Factura' : 'Comprobante'}: {a.nombre}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-8 text-[10px] text-slate-400">Generado por Cláriva · {fmtFecha(new Date().toISOString())}</p>
    </div>
  )
}
