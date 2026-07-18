import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import { fmtCobro } from '@shared/constants/cobro'

const fmtFecha = (s: string) => new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })

interface PagoRow { id: string; clinica: string; slug: string; fechaPago: string; monto: number; moneda: string; metodoPago: string; periodoDesde: string; periodoHasta: string }
interface VarConfig { nombre: string; presente: boolean; requerida: boolean }
interface ConfigPasarela { proveedor: string; moneda: string; configurada: boolean; variables: VarConfig[]; nota: string }
interface Data { pagos: PagoRow[]; totales: { CLP: number; USD: number }; pasarelas: { flow: { configurada: boolean }; lemonsqueezy: { configurada: boolean } }; configPasarelas: ConfigPasarela[] }

export function AdminPagos() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  useEffect(() => { adminService.pagosPlataforma().then((r) => setData(r as Data)).finally(() => setCargando(false)) }, [])

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Pagos</h1>
      <p className="text-sm text-slate-500 mb-6">Pagos de suscripción registrados en toda la plataforma y estado de las pasarelas de cobro.</p>

      {/* Estado de pasarelas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Recaudado CLP</p>
          <p className="text-xl font-bold mt-1 text-white">{fmtCobro(data?.totales.CLP ?? 0, 'CLP')}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Recaudado USD</p>
          <p className="text-xl font-bold mt-1 text-white">{fmtCobro(data?.totales.USD ?? 0, 'USD')}</p>
        </div>
        <Pasarela nombre="Flow" moneda="CLP" ok={data?.pasarelas.flow.configurada} />
        <Pasarela nombre="Lemon Squeezy" moneda="USD" ok={data?.pasarelas.lemonsqueezy.configurada} />
      </div>

      {/* Configuración de pasarelas (variables de entorno, sin exponer valores) */}
      {data?.configPasarelas && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-white mb-1">Configuración de pasarelas</h2>
          <p className="text-xs text-slate-500 mb-3">Las credenciales se cargan como variables de entorno en Railway (servicio BACKEND), por seguridad nunca se guardan en la base ni se muestran aquí. Este panel te dice qué falta.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {data.configPasarelas.map((c) => (
              <div key={c.proveedor} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white">{c.proveedor === 'LEMONSQUEEZY' ? 'Lemon Squeezy' : c.proveedor} <span className="text-xs text-slate-500">· {c.moneda}</span></p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.configurada ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{c.configurada ? '✓ Conectada' : 'Sin conexión'}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">{c.nota}</p>
                <ul className="mt-3 space-y-1.5">
                  {c.variables.map((v) => (
                    <li key={v.nombre} className="flex items-center justify-between gap-2 text-xs">
                      <code className="text-slate-300 break-all">{v.nombre}</code>
                      <span className={`shrink-0 font-semibold ${v.presente ? 'text-emerald-400' : 'text-rose-400'}`}>{v.presente ? '✓ cargada' : '✗ falta'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {cargando ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Cargando…</p>
        : !data || data.pagos.length === 0 ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Sin pagos registrados aún.</p>
        : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-6 py-3">Fecha</th><th className="text-left px-6 py-3">Clínica</th>
                <th className="text-left px-6 py-3">Período</th><th className="text-left px-6 py-3">Método</th>
                <th className="text-right px-6 py-3">Monto</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800">
                {data.pagos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40">
                    <td className="px-6 py-3 text-slate-300 whitespace-nowrap">{fmtFecha(p.fechaPago)}</td>
                    <td className="px-6 py-3"><Link to={`/plataforma/clinicas`} className="text-white hover:text-purple-300">{p.clinica}</Link><span className="text-xs text-slate-500 font-mono ml-2">{p.slug}</span></td>
                    <td className="px-6 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtFecha(p.periodoDesde)} → {fmtFecha(p.periodoHasta)}</td>
                    <td className="px-6 py-3 text-slate-400">{p.metodoPago}</td>
                    <td className="px-6 py-3 text-right text-white font-mono whitespace-nowrap">{fmtCobro(p.monto, p.moneda === 'USD' ? 'USD' : 'CLP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

function Pasarela({ nombre, moneda, ok }: { nombre: string; moneda: string; ok?: boolean }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-slate-500">{nombre} · {moneda}</p>
      <p className={`text-sm font-semibold mt-1 ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>{ok ? '✓ Configurada' : 'Pendiente'}</p>
      <p className="text-[10px] text-slate-500">{ok ? 'lista para cobrar' : 'faltan credenciales'}</p>
    </div>
  )
}
