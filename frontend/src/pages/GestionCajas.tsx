import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cajasService } from '@/services/caja.service'
import { fmtMonto } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'

const fmt = fmtMonto
const fechaHora = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

interface UsuarioRef { user: { id: string; name: string | null; email: string | null } }
interface ResumenSesion { saldoApertura: number; ingresos: number; egresos: number; saldoEsperado: number }
interface Sesion {
  id: string; estado: string; saldoApertura: number; abiertaPorNombre: string | null; abiertaAt: string
  cerradaPorNombre: string | null; cerradaAt: string | null; saldoEsperado: number | null; saldoReal: number | null
  diferencia: number | null; totalIngresos: number | null; totalEgresos: number | null; resumen?: ResumenSesion | null
}
interface CajaGestion {
  id: string; numero: number; nombre: string; descripcion: string | null; saldoInicial: number; activo: boolean
  usuarios: UsuarioRef[]; sesionAbierta: Sesion | null; ultimaCerrada: Sesion | null; totalSesiones: number
}

export function GestionCajas() {
  const { user } = useAuth()
  const autorizado = user?.role === 'admin' || Boolean(user?.permisos?.puedeGestionarCajas)
  const [cajas, setCajas] = useState<CajaGestion[]>([])
  const [cargando, setCargando] = useState(true)
  const [ver, setVer] = useState<CajaGestion | null>(null)

  useEffect(() => { cajasService.gestion().then((r) => setCajas(r as CajaGestion[])).catch(() => {}).finally(() => setCargando(false)) }, [])

  if (!autorizado) return (
    <div className="max-w-md mx-auto text-center py-16">
      <p className="text-slate-500 text-sm">No tienes acceso a la gestión de cajas. Pídele a un administrador el permiso <span className="font-medium">"Gestionar cajas"</span> en Equipo.</p>
      <Link to="/cobros" className="inline-block mt-3 text-sm text-cyan-700 font-semibold">Ir a Cobros</Link>
    </div>
  )

  const abiertas = cajas.filter((c) => c.sesionAbierta).length
  const nombreUsuarios = (c: CajaGestion) => c.usuarios.map((u) => u.user.name ?? u.user.email).filter(Boolean)

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Gestión de cajas</h1>
      <p className="text-sm text-slate-500 mb-5">Todas las cajas de la clínica y su estado. Cada caja es independiente: registra sus propios cobros y gastos, y su responsable rinde por su efectivo y pagos con tarjeta.</p>

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-md">
        <Kpi l="Cajas" v={String(cajas.length)} />
        <Kpi l="Abiertas ahora" v={String(abiertas)} tone="emerald" />
        <Kpi l="Inactivas" v={String(cajas.filter((c) => !c.activo).length)} tone="slate" />
      </div>

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p>
        : cajas.length === 0 ? <p className="text-slate-500 text-sm">No hay cajas creadas. Créalas desde Cobros.</p>
        : (
          <div className="space-y-3">
            {cajas.map((c) => {
              const abierta = c.sesionAbierta
              const r = abierta?.resumen
              return (
                <div key={c.id} className={`bg-white rounded-2xl border p-4 ${c.activo ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-white">Caja Nº {c.numero || '—'}</span>
                        <span className="font-semibold text-slate-900">{c.nombre}</span>
                        {!c.activo && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Inactiva</span>}
                        {abierta
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">● Abierta</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Cerrada</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Responsable(s): {nombreUsuarios(c).length ? nombreUsuarios(c).join(', ') : <span className="text-slate-400">sin asignar</span>}
                      </p>
                    </div>
                    <button onClick={() => setVer(c)} className="text-xs font-semibold text-cyan-700 hover:text-cyan-900 shrink-0">Ver sesiones ({c.totalSesiones}) →</button>
                  </div>

                  {abierta ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 border-t border-slate-100 pt-3">
                      <Dato l="Abrió" v={`${abierta.abiertaPorNombre ?? '—'}`} sub={fechaHora(abierta.abiertaAt)} />
                      <Dato l="Ingresos" v={fmt(r?.ingresos ?? 0)} tone="emerald" />
                      <Dato l="Egresos" v={fmt(r?.egresos ?? 0)} tone="rose" />
                      <Dato l="Saldo esperado" v={fmt(r?.saldoEsperado ?? 0)} tone="cyan" />
                    </div>
                  ) : c.ultimaCerrada ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 border-t border-slate-100 pt-3">
                      <Dato l="Último cierre" v={c.ultimaCerrada.cerradaPorNombre ?? '—'} sub={fechaHora(c.ultimaCerrada.cerradaAt)} />
                      <Dato l="Esperado" v={fmt(c.ultimaCerrada.saldoEsperado ?? 0)} />
                      <Dato l="Contado" v={fmt(c.ultimaCerrada.saldoReal ?? 0)} />
                      <Dato l="Diferencia" v={fmt(c.ultimaCerrada.diferencia ?? 0)} tone={c.ultimaCerrada.diferencia ? 'rose' : 'emerald'} />
                    </div>
                  ) : <p className="text-xs text-slate-400 mt-3 border-t border-slate-100 pt-3">Aún no se ha abierto esta caja.</p>}
                </div>
              )
            })}
          </div>
        )}

      {ver && <SesionesModal caja={ver} onClose={() => setVer(null)} />}
    </div>
  )
}

// Sesiones de una caja + detalle de movimientos de la sesión elegida.
function SesionesModal({ caja, onClose }: { caja: CajaGestion; onClose: () => void }) {
  const [sesiones, setSesiones] = useState<Sesion[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{ movimientos: Movimiento[] } | null>(null)
  useEffect(() => { cajasService.sesiones(caja.id).then((s) => setSesiones(s as Sesion[])).catch(() => setSesiones([])) }, [caja.id])
  useEffect(() => {
    if (!sel) { setDetalle(null); return }
    cajasService.sesion(caja.id, sel).then((d) => setDetalle(d as { movimientos: Movimiento[] })).catch(() => setDetalle(null))
  }, [sel, caja.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">Caja Nº {caja.numero} · {caja.nombre}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        {sesiones === null ? <p className="text-sm text-slate-400">Cargando…</p>
          : sesiones.length === 0 ? <p className="text-sm text-slate-400">Esta caja no tiene sesiones.</p>
          : (
            <div className="space-y-2">
              {sesiones.map((s) => (
                <div key={s.id} className="border border-slate-100 rounded-xl">
                  <button onClick={() => setSel(sel === s.id ? null : s.id)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{fechaHora(s.abiertaAt)} <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.estado === 'ABIERTA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.estado}</span></p>
                      <p className="text-xs text-slate-500">Abrió {s.abiertaPorNombre ?? '—'}{s.cerradaAt ? ` · cerró ${s.cerradaPorNombre ?? '—'} ${fechaHora(s.cerradaAt)}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {s.estado === 'CERRADA' ? <p className="text-xs font-mono text-slate-700">{fmt(s.saldoReal ?? 0)}{s.diferencia ? <span className={s.diferencia < 0 ? 'text-rose-600' : 'text-emerald-600'}> ({s.diferencia > 0 ? '+' : ''}{fmt(s.diferencia)})</span> : ''}</p> : <span className="text-xs text-cyan-700">{sel === s.id ? 'Ocultar' : 'Ver'}</span>}
                    </div>
                  </button>
                  {sel === s.id && (
                    <div className="border-t border-slate-100 px-3 py-2">
                      {!detalle ? <p className="text-xs text-slate-400">Cargando movimientos…</p>
                        : detalle.movimientos.length === 0 ? <p className="text-xs text-slate-400">Sin movimientos.</p>
                        : (
                          <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                            {detalle.movimientos.map((m) => (
                              <div key={m.id} className={`flex items-center justify-between py-1.5 text-sm ${m.anulado ? 'opacity-40 line-through' : ''}`}>
                                <div className="min-w-0"><p className="text-slate-700 truncate">{m.descripcion}</p><p className="text-[11px] text-slate-400">{fechaHora(m.fecha)}{m.user?.name ? ` · ${m.user.name}` : ''}{m.categoria ? ` · ${m.categoria}` : ''}</p></div>
                                <span className={`font-mono text-sm shrink-0 ${m.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.tipo === 'INGRESO' ? '+' : '−'}{fmt(m.monto)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      <Link to={`/print/caja/${caja.id}/${s.id}`} target="_blank" className="inline-block mt-2 text-xs font-semibold text-cyan-700">Imprimir / ver cierre →</Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}

interface Movimiento { id: string; tipo: string; monto: number; descripcion: string; categoria: string | null; fecha: string; anulado: boolean; user?: { name: string | null } | null }

function Kpi({ l, v, tone }: { l: string; v: string; tone?: string }) {
  const c = tone === 'emerald' ? 'text-emerald-700' : tone === 'slate' ? 'text-slate-500' : 'text-slate-900'
  return <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className={`text-2xl font-bold ${c}`}>{v}</p></div>
}
function Dato({ l, v, sub, tone }: { l: string; v: string; sub?: string; tone?: string }) {
  const c = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-600' : tone === 'cyan' ? 'text-cyan-700' : 'text-slate-800'
  return <div><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className={`text-sm font-semibold ${c}`}>{v}</p>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>
}
