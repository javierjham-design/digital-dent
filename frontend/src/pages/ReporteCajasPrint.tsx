import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ClinicaConfigDTO } from '@shared/types'
import { cajasService, type ReportePagos, type ReporteProfesionales, type ReporteMetodo } from '@/services/caja.service'
import { clinicaService } from '@/services/catalogo.service'
import { fmtMonto, paisMoneda } from '@/lib/money'
import { getPais } from '@shared/constants/paises'

const fmt = fmtMonto
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const fechaDia = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

function TablaMetodos({ porMetodo }: { porMetodo: ReporteMetodo[] }) {
  if (porMetodo.length === 0) return null
  return (
    <table className="w-full text-sm border border-slate-200 mb-4">
      <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left"><th className="px-3 py-1 font-medium">Medio de pago</th><th className="px-3 py-1 font-medium w-20 text-center">Pagos</th><th className="px-3 py-1 font-medium w-32 text-right">Monto</th></tr></thead>
      <tbody>
        {porMetodo.map((m) => (
          <tr key={m.metodo} className="border-t border-slate-100">
            <td className="px-3 py-1.5 text-slate-700">{m.metodo}</td>
            <td className="px-3 py-1.5 text-center text-slate-500">{m.cantidad}</td>
            <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmt(m.monto)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ReporteCajasPrint() {
  const [sp] = useSearchParams()
  const desde = sp.get('desde'); const hasta = sp.get('hasta')
  const tipo = sp.get('tipo') === 'profesionales' ? 'profesionales' : 'pagos'
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)
  const [pagos, setPagos] = useState<ReportePagos | null>(null)
  const [profes, setProfes] = useState<ReporteProfesionales | null>(null)

  useEffect(() => {
    clinicaService.obtener().then(setClinica).catch(() => {})
    if (tipo === 'profesionales') cajasService.reporteProfesionales(desde ?? undefined, hasta ?? undefined).then(setProfes).catch(() => {})
    else cajasService.reportePagos(desde ?? undefined, hasta ?? undefined).then(setPagos).catch(() => {})
  }, [desde, hasta, tipo])

  const listo = Boolean(clinica && (tipo === 'profesionales' ? profes : pagos))
  useEffect(() => { if (listo) { const t = setTimeout(() => window.print(), 500); return () => clearTimeout(t) } }, [listo])

  if (!clinica) return <p className="p-8 text-slate-500 text-sm">Generando reporte…</p>

  const titulo = tipo === 'profesionales' ? 'Pagos recibidos por profesional' : 'Pagos recibidos en el periodo'

  return (
    <div className="min-h-screen bg-white text-slate-800 p-8 max-w-3xl mx-auto print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg">Imprimir / Guardar PDF</button>
      </div>

      <div className="flex items-center justify-between gap-4 border-b-2 border-cyan-600 pb-4 mb-5">
        <div className="flex items-center gap-3">
          {clinica.logoUrl
            ? <img src={clinica.logoUrl} alt="" className="h-14 w-14 object-contain" />
            : <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white text-2xl font-bold flex items-center justify-center">{clinica.nombre.charAt(0)}</div>}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{clinica.nombre}</h1>
            <p className="text-xs text-slate-500">{[clinica.direccion, clinica.ciudad].filter(Boolean).join(', ')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-700">{titulo}</p>
          <p className="text-xs text-slate-500">{fechaDia(desde)} — {fechaDia(hasta)}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mb-4">Montos en {getPais(paisMoneda()).moneda.code}. Se muestra lo exactamente cobrado (bruto), sin descontar la retención de los medios de pago.</p>

      {tipo === 'pagos' && pagos && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Recaudación total · {pagos.cantidad} pago(s)</p>
            <p className="text-xl font-bold font-mono text-cyan-700">{fmt(pagos.total)}</p>
          </div>
          <TablaMetodos porMetodo={pagos.porMetodo} />
          <p className="text-sm font-semibold text-slate-700 mb-1">Detalle de pagos</p>
          <table className="w-full text-sm border border-slate-200">
            <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left">
              <th className="px-2 py-1 font-medium">Fecha</th><th className="px-2 py-1 font-medium">Nº</th><th className="px-2 py-1 font-medium">Paciente</th>
              <th className="px-2 py-1 font-medium">Medio</th><th className="px-2 py-1 font-medium">Recibió</th><th className="px-2 py-1 font-medium">Caja</th>
              <th className="px-2 py-1 font-medium text-right">Monto</th>
            </tr></thead>
            <tbody>
              {pagos.items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{fechaHora(it.fechaPago)}</td>
                  <td className="px-2 py-1 text-slate-400 font-mono">#{it.numero}</td>
                  <td className="px-2 py-1 text-slate-700">{it.paciente}</td>
                  <td className="px-2 py-1 text-slate-600">{it.metodo}</td>
                  <td className="px-2 py-1 text-slate-600">{it.recibidoPor}</td>
                  <td className="px-2 py-1 text-slate-500">{it.cajaNumero ? `Nº ${it.cajaNumero}` : '—'}</td>
                  <td className="px-2 py-1 text-right font-mono text-slate-800">{fmt(it.monto)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-cyan-600">
                <td className="px-2 py-1.5 font-bold text-slate-800" colSpan={6}>Total</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-cyan-700">{fmt(pagos.total)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {tipo === 'profesionales' && profes && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Total recibido · {profes.cantidad} pago(s)</p>
            <p className="text-xl font-bold font-mono text-cyan-700">{fmt(profes.total)}</p>
          </div>
          <TablaMetodos porMetodo={profes.porMetodo} />
          <p className="text-sm font-semibold text-slate-700 mb-2">Desglose por profesional (quien recibió el pago)</p>
          {profes.profesionales.map((p) => (
            <div key={p.profesionalId} className="border border-slate-200 rounded-lg p-3 mb-2 break-inside-avoid">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-sm font-semibold text-slate-800">{p.nombre} <span className="text-xs font-normal text-slate-400">· {p.cantidad} pago(s)</span></p>
                <p className="text-base font-bold font-mono text-cyan-700">{fmt(p.total)}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {p.porMetodo.map((m) => <span key={m.metodo}>{m.metodo}: <span className="font-mono font-semibold">{fmt(m.monto)}</span> ({m.cantidad})</span>)}
              </div>
            </div>
          ))}
        </>
      )}

      <p className="text-[11px] text-slate-400 mt-8 border-t border-slate-100 pt-3">Reporte generado por {clinica.nombre} · {titulo}.</p>
    </div>
  )
}
