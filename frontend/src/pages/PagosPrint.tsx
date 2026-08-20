import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ClinicaConfigDTO, PacienteDTO } from '@shared/types'
import { cobrosService } from '@/services/caja.service'
import { clinicaService } from '@/services/catalogo.service'
import { pacientesService } from '@/services/clinica.service'
import { fmtMonto } from '@/lib/money'

const fmt = fmtMonto
const fechaHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

interface Pago {
  id: string; numero: number; monto: number; estado: string; anulado: boolean
  fechaPago: string | null; concepto: string
  medioPago?: { nombre: string } | null
  reciboUsuario?: { name: string | null } | null
}

// Resumen imprimible de TODOS los pagos recibidos de un paciente (fechas, montos,
// métodos). Se abre en pestaña nueva desde la pestaña Recaudación de la ficha.
export function PagosPrint() {
  const { pacienteId = '' } = useParams()
  const [pagos, setPagos] = useState<Pago[] | null>(null)
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)
  const [paciente, setPaciente] = useState<PacienteDTO | null>(null)

  useEffect(() => {
    cobrosService.porPaciente(pacienteId).then((c) => setPagos(c as Pago[])).catch(() => setPagos([]))
    clinicaService.obtener().then(setClinica).catch(() => {})
    pacientesService.obtener(pacienteId).then(setPaciente).catch(() => {})
  }, [pacienteId])

  const listo = Boolean(pagos && clinica)
  useEffect(() => {
    if (!listo) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [listo])

  if (!pagos || !clinica) return <p className="p-8 text-slate-500 text-sm">Generando resumen…</p>

  const recibidos = pagos.filter((p) => !p.anulado && p.estado === 'PAGADO')
  const total = recibidos.reduce((s, p) => s + p.monto, 0)
  const nombrePac = paciente ? `${paciente.nombre} ${paciente.apellido}` : (pagos[0] && '') || '—'

  return (
    <div className="min-h-screen bg-white text-slate-800 p-8 max-w-3xl mx-auto print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg">Imprimir / Guardar PDF</button>
      </div>

      {/* Encabezado */}
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
          <p className="text-sm font-semibold text-slate-700">Resumen de pagos</p>
          <p className="text-xs text-slate-500">{new Date().toLocaleDateString('es-CL', { dateStyle: 'long' })}</p>
        </div>
      </div>

      {/* Paciente */}
      <div className="flex justify-between text-sm mb-4">
        <div><span className="text-slate-400">Paciente: </span><span className="font-semibold text-slate-800">{nombrePac}</span></div>
        {paciente?.rut && <div><span className="text-slate-400">RUT: </span><span className="text-slate-700">{paciente.rut}</span></div>}
      </div>

      {/* Tabla de pagos */}
      <table className="w-full text-sm border border-slate-200 mb-4">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <th className="px-3 py-2 text-left font-medium">Fecha</th>
            <th className="px-3 py-2 text-left font-medium">N°</th>
            <th className="px-3 py-2 text-left font-medium">Concepto</th>
            <th className="px-3 py-2 text-left font-medium">Método</th>
            <th className="px-3 py-2 text-right font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {recibidos.length === 0 ? (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Sin pagos recibidos.</td></tr>
          ) : recibidos.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fechaHora(p.fechaPago)}</td>
              <td className="px-3 py-2 text-slate-600">{p.numero}</td>
              <td className="px-3 py-2 text-slate-700">{p.concepto || 'Pago'}</td>
              <td className="px-3 py-2 text-slate-700">{p.medioPago?.nombre ?? 'Efectivo'}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-800">{fmt(p.monto)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 border-t-2 border-cyan-600">
            <td className="px-3 py-2 font-semibold text-slate-700" colSpan={4}>Total recibido ({recibidos.length} pago{recibidos.length === 1 ? '' : 's'})</td>
            <td className="px-3 py-2 text-right font-mono font-bold text-lg text-cyan-700">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-xs text-slate-400 mt-8 text-center">Resumen de pagos emitido por {clinica.nombre}. Excluye pagos anulados.</p>
    </div>
  )
}
