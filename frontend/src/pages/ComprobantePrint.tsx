import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ClinicaConfigDTO } from '@shared/types'
import { cobrosService } from '@/services/caja.service'
import { clinicaService } from '@/services/catalogo.service'
import { fmtMonto } from '@/lib/money'

const fmt = fmtMonto
const fechaHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' }) : '—')

interface CobroItem { id: string; descripcion?: string | null; monto: number; tratamiento?: { prestacion?: { nombre: string } | null } | null }
interface Cobro {
  id: string; numero: number; concepto?: string | null; monto: number; estado: string; anulado: boolean
  fechaPago: string | null; numeroReferencia?: string | null; numeroBoleta?: string | null
  paciente: { nombre: string; apellido: string; rut?: string | null }
  medioPago?: { nombre: string } | null
  reciboUsuario?: { name?: string | null; email?: string | null } | null
  items?: CobroItem[]
  movimientos?: { sesion?: { numero: number } | null }[]
}

// Comprobante de pago imprimible (una acción → PDF/impresión). Se abre en pestaña
// nueva desde Cobros, el historial de la caja o el historial del paciente.
export function ComprobantePrint() {
  const { id = '' } = useParams()
  const [cobro, setCobro] = useState<Cobro | null>(null)
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)

  useEffect(() => {
    cobrosService.obtener(id).then((c) => setCobro(c as Cobro)).catch(() => {})
    clinicaService.obtener().then(setClinica).catch(() => {})
  }, [id])

  const listo = Boolean(cobro && clinica)
  useEffect(() => {
    if (!listo) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [listo])

  if (!cobro || !clinica) return <p className="p-8 text-slate-500 text-sm">Generando comprobante…</p>

  const items = (cobro.items ?? []).filter((it) => it.monto > 0)
  const cajaNumero = cobro.movimientos?.[0]?.sesion?.numero ?? null
  const recibio = cobro.reciboUsuario?.name ?? cobro.reciboUsuario?.email ?? '—'
  const anulado = cobro.anulado || cobro.estado === 'ANULADO'

  return (
    <div className="min-h-screen bg-white text-slate-800 p-8 max-w-2xl mx-auto print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg">Imprimir / Guardar PDF</button>
      </div>

      {/* Encabezado de la clínica */}
      <div className="flex items-center justify-between gap-4 border-b-2 border-cyan-600 pb-4 mb-5">
        <div className="flex items-center gap-3">
          {clinica.logoUrl
            ? <img src={clinica.logoUrl} alt="" className="h-14 w-14 object-contain" />
            : <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white text-2xl font-bold flex items-center justify-center">{clinica.nombre.charAt(0)}</div>}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{clinica.nombre}</h1>
            <p className="text-xs text-slate-500">{[clinica.direccion, clinica.ciudad].filter(Boolean).join(', ')}</p>
            <p className="text-xs text-slate-500">{[clinica.telefono, clinica.email].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-700">Comprobante de pago</p>
          <p className="text-lg font-bold text-slate-900">N° {cobro.numero}</p>
          {anulado && <p className="text-xs font-bold text-rose-600">ANULADO</p>}
        </div>
      </div>

      {/* Datos del pago */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-5">
        <Linea k="Paciente" v={`${cobro.paciente.nombre} ${cobro.paciente.apellido}`} />
        <Linea k="RUT" v={cobro.paciente.rut ?? '—'} />
        <Linea k="Fecha de pago" v={fechaHora(cobro.fechaPago)} />
        <Linea k="Medio de pago" v={cobro.medioPago?.nombre ?? 'Efectivo'} />
        {cobro.numeroReferencia && <Linea k="N° de operación" v={cobro.numeroReferencia} />}
        {cobro.numeroBoleta && <Linea k="N° de boleta" v={cobro.numeroBoleta} />}
        <Linea k="Recibido por" v={recibio} />
        {cajaNumero != null && <Linea k="Caja" v={`N° ${cajaNumero}`} />}
      </div>

      {/* Detalle */}
      <p className="text-sm font-semibold text-slate-700 mb-1">Detalle</p>
      <table className="w-full text-sm border border-slate-200 mb-4">
        <tbody>
          {items.length > 0 ? items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="px-3 py-2 text-slate-700">{it.descripcion || it.tratamiento?.prestacion?.nombre || 'Prestación'}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-800">{fmt(it.monto)}</td>
            </tr>
          )) : (
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 text-slate-700">{cobro.concepto || 'Pago'}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-800">{fmt(cobro.monto)}</td>
            </tr>
          )}
          <tr className="bg-slate-50">
            <td className="px-3 py-2 text-right font-semibold text-slate-700">Total pagado</td>
            <td className="px-3 py-2 text-right font-mono font-bold text-lg text-slate-900">{fmt(cobro.monto)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-xs text-slate-400 mt-8 text-center">Comprobante emitido por {clinica.nombre}. Gracias por su pago.</p>
    </div>
  )
}

function Linea({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-1">
      <span className="text-slate-400">{k}</span>
      <span className="text-slate-700 font-medium text-right">{v}</span>
    </div>
  )
}
