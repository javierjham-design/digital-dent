import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PacienteDTO, ClinicaConfigDTO } from '@shared/types'
import { planesService } from '@/services/clinico.service'
import { pacientesService } from '@/services/clinica.service'
import { clinicaService } from '@/services/catalogo.service'

const fmtCLP = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(n)

interface PTrat {
  id: string; estado: string; precio: number; descuento: number; diente: number | null; cara: string | null; notas: string | null
  prestacion: { nombre: string }; cobroItems: { monto: number; cobro: { estado: string } | null }[]
}
interface PSeccion { id: string; titulo: string; tratamientos: PTrat[] }
interface PPlan { id: string; nombre: string; pacienteId: string; doctorTitular: { name: string | null } | null; secciones: PSeccion[]; tratamientos: PTrat[] }

const neto = (t: PTrat) => Math.round(t.precio * (1 - (t.descuento || 0) / 100))
const pagado = (t: PTrat) => (t.cobroItems || []).filter((ci) => ci.cobro?.estado === 'PAGADO').reduce((s, ci) => s + ci.monto, 0)
const piezaLabel = (t: PTrat) => t.diente
  ? `${t.diente}${t.cara ? ` (${t.cara.split('').join(',')})` : ''}`
  : (t.cara ? t.cara : (t.notas ? t.notas.replace(/^Piezas:\s*/, '') : '—'))

export function PlanPrint() {
  const { id = '' } = useParams()
  const [plan, setPlan] = useState<PPlan | null>(null)
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)
  const [paciente, setPaciente] = useState<PacienteDTO | null>(null)

  useEffect(() => {
    planesService.obtener(id).then((p) => {
      const pp = p as PPlan
      setPlan(pp)
      if (pp.pacienteId) pacientesService.obtener(pp.pacienteId).then(setPaciente).catch(() => {})
    }).catch(() => {})
    clinicaService.obtener().then(setClinica).catch(() => {})
  }, [id])

  const listo = Boolean(plan && clinica)
  useEffect(() => {
    if (!listo) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [listo])

  const todas = useMemo(() => (plan ? [...plan.secciones.flatMap((s) => s.tratamientos), ...plan.tratamientos] : []), [plan])
  if (!plan || !clinica) return <p className="p-8 text-slate-500 text-sm">Generando presupuesto…</p>

  const total = todas.reduce((s, t) => s + neto(t), 0)
  const realizado = todas.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + neto(t), 0)
  const abonado = todas.reduce((s, t) => s + pagado(t), 0)
  const saldo = Math.max(0, total - abonado)

  const secciones: PSeccion[] = [
    ...plan.secciones,
    ...(plan.tratamientos.length ? [{ id: '', titulo: 'Otras prestaciones', tratamientos: plan.tratamientos }] : []),
  ]

  return (
    <div className="min-h-screen bg-white text-slate-800 p-8 max-w-3xl mx-auto print:p-0">
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
          <p className="text-sm font-semibold text-slate-700">Presupuesto</p>
          <p className="text-xs text-slate-500">{new Date().toLocaleDateString('es-CL', { dateStyle: 'long' })}</p>
        </div>
      </div>

      {/* Paciente + plan */}
      <div className="flex justify-between text-sm mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Paciente</p>
          <p className="font-semibold text-slate-800">{paciente ? `${paciente.nombre} ${paciente.apellido}` : '—'}</p>
          {paciente?.rut && <p className="text-xs text-slate-500">{paciente.rut}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Plan de tratamiento</p>
          <p className="font-semibold text-slate-800">{plan.nombre}</p>
          {plan.doctorTitular?.name && <p className="text-xs text-slate-500">Profesional: {plan.doctorTitular.name}</p>}
        </div>
      </div>

      {/* Secciones */}
      {secciones.map((s) => (
        <div key={s.id || 'sin'} className="mb-4 break-inside-avoid">
          <div className="flex justify-between bg-slate-100 px-3 py-1.5 rounded-t-lg">
            <span className="text-sm font-semibold text-slate-700">{s.titulo}</span>
            <span className="text-sm font-mono text-slate-600">{fmtCLP(s.tratamientos.reduce((a, t) => a + neto(t), 0))}</span>
          </div>
          <table className="w-full text-sm border border-slate-200 border-t-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left">
                <th className="px-3 py-1 font-medium">Prestación</th>
                <th className="px-3 py-1 font-medium w-28">Pieza / zona</th>
                <th className="px-3 py-1 font-medium w-16 text-center">Dscto</th>
                <th className="px-3 py-1 font-medium w-28 text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              {s.tratamientos.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-700">{t.prestacion.nombre}</td>
                  <td className="px-3 py-1.5 text-slate-600">{piezaLabel(t)}</td>
                  <td className="px-3 py-1.5 text-center text-slate-500">{t.descuento ? `${t.descuento}%` : '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtCLP(neto(t))}</td>
                </tr>
              ))}
              {s.tratamientos.length === 0 && <tr><td colSpan={4} className="px-3 py-2 text-xs text-slate-400">Sin prestaciones.</td></tr>}
            </tbody>
          </table>
        </div>
      ))}

      {/* Totales */}
      <div className="flex justify-end mt-6">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Realizado</span><span className="font-mono">{fmtCLP(realizado)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Abonado</span><span className="font-mono">{fmtCLP(abonado)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-500">Saldo por abonar</span><span className="font-mono font-semibold text-amber-600">{fmtCLP(saldo)}</span></div>
          <div className="flex justify-between border-t-2 border-cyan-600 pt-1.5 mt-1"><span className="font-bold text-slate-800">TOTAL</span><span className="font-mono font-bold text-cyan-700 text-base">{fmtCLP(total)}</span></div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-10 border-t border-slate-100 pt-3">
        Presupuesto referencial. Valores en pesos chilenos (CLP). Documento generado por {clinica.nombre}.
      </p>
    </div>
  )
}
