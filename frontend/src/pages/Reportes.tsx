import { useState } from 'react'
import { descargarReporte, type ReporteTipo } from '@/services/reportes.service'
import { ApiError } from '@/services/api'

interface ReporteDef { tipo: ReporteTipo; titulo: string; descripcion: string; usaFechas: boolean }

const REPORTES: ReporteDef[] = [
  { tipo: 'pacientes', titulo: 'Pacientes', descripcion: 'Nómina de pacientes con datos de contacto y previsión.', usaFechas: true },
  { tipo: 'citas', titulo: 'Citas', descripcion: 'Agenda histórica con paciente, profesional, estado y notas.', usaFechas: true },
  { tipo: 'cobros', titulo: 'Cobros', descripcion: 'Pagos recibidos con monto neto, comisión y medio de pago.', usaFechas: true },
  { tipo: 'tratamientos', titulo: 'Tratamientos', descripcion: 'Prestaciones planificadas y realizadas por profesional.', usaFechas: true },
  { tipo: 'liquidaciones', titulo: 'Liquidaciones', descripcion: 'Liquidaciones de honorarios por período y profesional.', usaFechas: false },
  { tipo: 'caja', titulo: 'Movimientos de caja', descripcion: 'Ingresos y egresos de caja, con anulaciones.', usaFechas: true },
  { tipo: 'morosos', titulo: 'Morosos', descripcion: 'Pacientes con cobros pendientes y días de mora.', usaFechas: false },
]

export function Reportes() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [bajando, setBajando] = useState<ReporteTipo | null>(null)
  const [error, setError] = useState('')

  async function descargar(tipo: ReporteTipo) {
    setBajando(tipo); setError('')
    try {
      const params: Record<string, string> = {}
      if (desde) params.desde = desde
      if (hasta) params.hasta = hasta
      await descargarReporte(tipo, params)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo generar el reporte')
    } finally {
      setBajando(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Reportes</h1>
      <p className="text-sm text-slate-500 mb-6">Exporta la información de la clínica a Excel (XLSX).</p>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Rango de fechas (opcional)</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </label>
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </label>
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta('') }} className="text-sm text-slate-400 hover:text-slate-600 pb-2">Limpiar</button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">El rango aplica a Pacientes, Citas, Cobros, Tratamientos y Caja. Liquidaciones y Morosos lo ignoran.</p>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        {REPORTES.map((r) => (
          <div key={r.tipo} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col">
            <h2 className="font-semibold text-slate-800">{r.titulo}</h2>
            <p className="text-sm text-slate-500 mt-1 flex-1">{r.descripcion}</p>
            <button onClick={() => descargar(r.tipo)} disabled={bajando !== null}
              className="mt-3 self-start px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
              {bajando === r.tipo ? 'Generando…' : 'Descargar XLSX'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
