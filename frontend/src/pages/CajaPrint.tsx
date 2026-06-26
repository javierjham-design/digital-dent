import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ClinicaConfigDTO } from '@shared/types'
import { cajasService } from '@/services/caja.service'
import { clinicaService } from '@/services/catalogo.service'

const fmtCLP = (n: number | null | undefined) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n ?? 0))
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

interface Sesion {
  id: string; abiertaAt: string; cerradaAt: string | null; saldoApertura: number
  saldoEsperado?: number | null; saldoReal?: number | null; diferencia?: number | null
  totalIngresos?: number | null; totalEgresos?: number | null; observaciones?: string | null
  abiertaPorNombre?: string | null; cerradaPorNombre?: string | null
}
interface Movimiento { id: string; tipo: string; monto: number; descripcion: string; categoria: string | null; fecha: string; anulado: boolean; user?: { name: string | null } | null }

export function CajaPrint() {
  const { cajaId = '', sesionId = '' } = useParams()
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [cajaNombre, setCajaNombre] = useState('')
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)

  useEffect(() => {
    cajasService.sesion(cajaId, sesionId).then((d) => {
      const dd = d as { sesion: Sesion; movimientos: Movimiento[] }
      setSesion(dd.sesion); setMovs(dd.movimientos)
    }).catch(() => {})
    cajasService.obtener(cajaId).then((c) => setCajaNombre((c as { nombre: string }).nombre)).catch(() => {})
    clinicaService.obtener().then(setClinica).catch(() => {})
  }, [cajaId, sesionId])

  const listo = Boolean(sesion && clinica)
  useEffect(() => {
    if (!listo) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [listo])

  if (!sesion || !clinica) return <p className="p-8 text-slate-500 text-sm">Generando cierre de caja…</p>

  const ingresos = movs.filter((m) => !m.anulado && m.tipo === 'INGRESO')
  const egresos = movs.filter((m) => !m.anulado && m.tipo === 'EGRESO')

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
          <p className="text-sm font-semibold text-slate-700">Cierre de caja</p>
          <p className="text-xs text-slate-500">{cajaNombre}</p>
        </div>
      </div>

      {/* Datos de la sesión */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-5">
        <Linea k="Apertura" v={`${fechaHora(sesion.abiertaAt)} · ${sesion.abiertaPorNombre ?? '—'}`} />
        <Linea k="Cierre" v={`${sesion.cerradaAt ? fechaHora(sesion.cerradaAt) : '—'} · ${sesion.cerradaPorNombre ?? '—'}`} />
      </div>

      {/* Resumen */}
      <table className="w-full text-sm border border-slate-200 mb-5">
        <tbody>
          <Fila k="Saldo de apertura" v={fmtCLP(sesion.saldoApertura)} />
          <Fila k="Total ingresos" v={fmtCLP(sesion.totalIngresos)} tone="emerald" />
          <Fila k="Total egresos (gastos)" v={fmtCLP(sesion.totalEgresos)} tone="rose" />
          <Fila k="Saldo esperado en caja" v={fmtCLP(sesion.saldoEsperado)} bold />
          <Fila k="Conteo real (arqueo)" v={fmtCLP(sesion.saldoReal)} bold />
          <Fila k="Diferencia" v={fmtCLP(sesion.diferencia)} tone={sesion.diferencia ? 'rose' : 'emerald'} bold />
        </tbody>
      </table>
      {sesion.observaciones && <p className="text-xs text-slate-600 mb-5 italic">Observaciones: {sesion.observaciones}</p>}

      {/* Detalle de movimientos */}
      <Bloque titulo={`Ingresos (${ingresos.length})`} movs={ingresos} signo="+" />
      <Bloque titulo={`Egresos / gastos (${egresos.length})`} movs={egresos} signo="−" />

      {/* Firmas */}
      <div className="grid grid-cols-2 gap-8 mt-12">
        <Firma label="Responsable de caja" nombre={sesion.cerradaPorNombre ?? sesion.abiertaPorNombre} />
        <Firma label="Recibido conforme" nombre={null} />
      </div>

      <p className="text-[11px] text-slate-400 mt-8 border-t border-slate-100 pt-3">
        Cierre de caja generado por {clinica.nombre}. Valores en pesos chilenos (CLP).
      </p>
    </div>
  )
}

function Linea({ k, v }: { k: string; v: string }) {
  return <div><span className="text-[11px] uppercase tracking-wide text-slate-400">{k}</span><p className="text-slate-700">{v}</p></div>
}
function Fila({ k, v, tone, bold }: { k: string; v: string; tone?: 'emerald' | 'rose'; bold?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-slate-800'
  return (
    <tr className="border-b border-slate-100">
      <td className={`px-3 py-2 ${bold ? 'font-semibold' : ''} text-slate-600`}>{k}</td>
      <td className={`px-3 py-2 text-right font-mono ${c} ${bold ? 'font-bold' : ''}`}>{v}</td>
    </tr>
  )
}
function Bloque({ titulo, movs, signo }: { titulo: string; movs: Movimiento[]; signo: string }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <p className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-t-lg">{titulo}</p>
      <table className="w-full text-sm border border-slate-200 border-t-0">
        <tbody>
          {movs.length === 0 ? <tr><td className="px-3 py-2 text-xs text-slate-400">Sin movimientos.</td></tr> : movs.map((m) => (
            <tr key={m.id} className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-700">{m.descripcion}{m.categoria ? ` · ${m.categoria}` : ''}</td>
              <td className="px-3 py-1.5 text-slate-500 w-36">{fechaHora(m.fecha)}</td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-700 w-28">{signo}{fmtCLP(m.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Firma({ label, nombre }: { label: string; nombre: string | null | undefined }) {
  return (
    <div className="text-center">
      <div className="border-t border-slate-400 pt-1 mt-10">
        <p className="text-sm font-medium text-slate-700">{nombre ?? ' '}</p>
        <p className="text-[11px] text-slate-400">{label}</p>
      </div>
    </div>
  )
}
