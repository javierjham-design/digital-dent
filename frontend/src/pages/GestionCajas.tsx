import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cajasService } from '@/services/caja.service'
import { ApiError } from '@/services/api'
import { fmtMonto } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'
import { FlujoCaja, type FlujoMovimiento, type FlujoResumen } from '@/components/FlujoCaja'

const fmt = fmtMonto
const fechaHora = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

interface UsuarioRef { user: { id: string; name: string | null; email: string | null } }
interface MetodoResumen { metodo: string; monto: number; cantidad: number }
interface ResumenSesion { saldoApertura: number; ingresos: number; egresos: number; saldoEsperado: number; ingresosEfectivo?: number; ingresosOtros?: number; porMetodo?: MetodoResumen[] }
interface Sesion {
  id: string; numero: number; estado: string; saldoApertura: number; abiertaPorNombre: string | null; abiertaAt: string
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
  const [form, setForm] = useState<CajaGestion | 'nueva' | null>(null)
  const [cerrar, setCerrar] = useState<CajaGestion | null>(null)
  const [abrir, setAbrir] = useState<CajaGestion | null>(null)
  const [tab, setTab] = useState<'abiertas' | 'cerradas'>('abiertas')

  const cargar = () => cajasService.gestion().then((r) => setCajas(r as CajaGestion[])).catch(() => {}).finally(() => setCargando(false))
  useEffect(() => { cargar() }, [])

  if (!autorizado) return (
    <div className="max-w-md mx-auto text-center py-16">
      <p className="text-slate-500 text-sm">No tienes acceso a la gestión de cajas. Pídele a un administrador el permiso <span className="font-medium">"Gestionar cajas"</span> en Equipo.</p>
      <Link to="/cobros" className="inline-block mt-3 text-sm text-cyan-700 font-semibold">Ir a Cobros</Link>
    </div>
  )

  const cajasAbiertas = cajas.filter((c) => c.sesionAbierta)
  const cajasCerradas = cajas.filter((c) => !c.sesionAbierta)
  const lista = tab === 'abiertas' ? cajasAbiertas : cajasCerradas
  const nombreUsuarios = (c: CajaGestion) => c.usuarios.map((u) => u.user.name ?? u.user.email).filter(Boolean)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Gestión de cajas</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">Todas las cajas de la clínica y su estado. Cada caja es de un usuario (exclusiva): sólo su usuario recibe pagos con ella, por lo que los pagos de uno nunca se mezclan con los de otro. Como administrador puedes abrir y cerrar la caja de otro usuario; al cerrar, el efectivo que dejes se arrastra automáticamente a la próxima apertura sin perderse. El cuadre es sólo sobre el efectivo; tarjeta/transferencia se registran por su medio.</p>

      {/* Pestañas: no mezclar cajas abiertas con las cerradas / historial */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        <TabBtn activo={tab === 'abiertas'} onClick={() => setTab('abiertas')} label="Cajas abiertas" count={cajasAbiertas.length} tone="emerald" />
        <TabBtn activo={tab === 'cerradas'} onClick={() => setTab('cerradas')} label="Cajas cerradas" count={cajasCerradas.length} tone="slate" />
      </div>

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p>
        : cajas.length === 0 ? <p className="text-slate-500 text-sm">No hay cajas creadas. Créalas desde Cobros.</p>
        : lista.length === 0 ? <p className="text-slate-500 text-sm">{tab === 'abiertas' ? 'No hay cajas abiertas en este momento.' : 'No hay cajas cerradas. Las cajas cerradas y su historial aparecen aquí.'}</p>
        : (
          <div className="space-y-3">
            {lista.map((c) => {
              const abierta = c.sesionAbierta
              const r = abierta?.resumen
              return (
                <div key={c.id} className={`bg-white rounded-2xl border p-4 ${c.activo ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-white">Caja Nº {c.numero || '—'}</span>
                        {!c.activo && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Inactiva</span>}
                        {abierta
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">● Abierta · Apertura Nº {abierta.numero || '—'}</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Cerrada</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Responsable(s): {nombreUsuarios(c).length ? nombreUsuarios(c).join(', ') : <span className="text-slate-400">sin asignar</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {abierta
                        ? <button onClick={() => setCerrar(c)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Cerrar caja</button>
                        : c.activo && <button onClick={() => setAbrir(c)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">Abrir caja</button>}
                      <button onClick={() => setForm(c)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Editar</button>
                      <button onClick={() => setVer(c)} className="text-xs font-semibold text-cyan-700 hover:text-cyan-900">Ver historial de pagos →</button>
                    </div>
                  </div>

                  {abierta ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 border-t border-slate-100 pt-3">
                      <Dato l="Abrió" v={`${abierta.abiertaPorNombre ?? '—'}`} sub={fechaHora(abierta.abiertaAt)} />
                      <Dato l="Recaudación" v={fmt(r?.ingresos ?? 0)} tone="emerald" sub={r?.ingresosOtros ? `Efectivo ${fmt(r?.ingresosEfectivo ?? 0)}` : undefined} />
                      <Dato l="Egresos" v={fmt(r?.egresos ?? 0)} tone="rose" />
                      <Dato l="Efectivo esperado" v={fmt(r?.saldoEsperado ?? 0)} tone="cyan" />
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
      {form && <CajaFormModal caja={form === 'nueva' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); cargar() }} />}
      {cerrar && <CerrarCajaModal caja={cerrar} onClose={() => setCerrar(null)} onDone={() => { setCerrar(null); cargar() }} />}
      {abrir && <AbrirCajaModal caja={abrir} onClose={() => setAbrir(null)} onDone={() => { setAbrir(null); cargar() }} />}
    </div>
  )
}

// Abrir una caja cerrada. El saldo de apertura se sugiere automáticamente con el
// efectivo que quedó en el último cierre (arrastre): ese saldo no se pierde. El
// admin puede abrir la caja de otro usuario; los pagos siguen siendo exclusivos.
function AbrirCajaModal({ caja, onClose, onDone }: { caja: CajaGestion; onClose: () => void; onDone: () => void }) {
  const [saldo, setSaldo] = useState('')
  const [sugerido, setSugerido] = useState<number | null>(null)
  const [g, setG] = useState(false); const [err, setErr] = useState('')

  useEffect(() => {
    cajasService.saldoSugerido(caja.id)
      .then((r) => { setSugerido(r.saldoSugerido); setSaldo(String(r.saldoSugerido)) })
      .catch(() => { setSugerido(0); setSaldo('0') })
  }, [caja.id])

  async function abrir() {
    setG(true); setErr('')
    try { await cajasService.abrir(caja.id, Number(saldo) || 0); onDone() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo abrir') } finally { setG(false) }
  }
  const responsable = caja.usuarios.map((u) => u.user.name ?? u.user.email).filter(Boolean).join(', ') || 'sin usuario'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold text-slate-900">Abrir Caja Nº {caja.numero}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        <p className="text-xs text-slate-500 mb-3">Responsable: <span className="font-medium text-slate-700">{responsable}</span></p>
        <label className="block mb-2"><span className="block text-sm font-medium text-slate-700 mb-1">Efectivo de apertura</span>
          <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="numeric" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono" /></label>
        {sugerido != null && (
          <p className="text-xs text-slate-500 mb-3">
            Se arrastra automáticamente el efectivo que quedó en el último cierre: <span className="font-mono font-semibold text-slate-700">{fmt(sugerido)}</span>. Ese saldo no se pierde.
          </p>
        )}
        {err && <p className="text-sm text-rose-600 mb-1">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={abrir} disabled={g || sugerido == null} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? 'Abriendo…' : 'Abrir caja'}</button>
        </div>
      </div>
    </div>
  )
}

// Cerrar (cuadrar) una caja abierta: efectivo contado, retirado y lo que queda.
function CerrarCajaModal({ caja, onClose, onDone }: { caja: CajaGestion; onClose: () => void; onDone: () => void }) {
  const r = caja.sesionAbierta?.resumen
  const esperado = r?.saldoEsperado ?? 0
  const [contado, setContado] = useState('')
  const [retirado, setRetirado] = useState('')
  const [obs, setObs] = useState('')
  const [g, setG] = useState(false); const [err, setErr] = useState('')
  const nContado = Number(contado) || 0, nRetirado = Number(retirado) || 0
  const dejado = Math.max(0, nContado - nRetirado)
  const dif = contado !== '' ? nContado - esperado : null
  const cuadre = dif == null ? null : dif === 0 ? { l: 'Caja cuadrada', c: 'text-emerald-600' } : dif > 0 ? { l: `Sobrante ${fmt(dif)}`, c: 'text-amber-600' } : { l: `Faltante ${fmt(-dif)}`, c: 'text-rose-600' }

  async function cerrar() {
    if (contado === '') { setErr('Ingresa el efectivo contado.'); return }
    if (nRetirado > nContado) { setErr('No puedes retirar más de lo contado.'); return }
    setG(true); setErr('')
    try { await cajasService.cerrar(caja.id, { saldoReal: nContado, efectivoRetirado: nRetirado, efectivoDejado: dejado, observaciones: obs || undefined }); onDone() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo cerrar') } finally { setG(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold text-slate-900">Cerrar Caja Nº {caja.numero} · {caja.nombre}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        {r && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div><p className="text-[10px] uppercase text-slate-400">Apertura</p><p className="text-sm font-semibold">{fmt(r.saldoApertura)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-400">Ingresos</p><p className="text-sm font-semibold text-emerald-700">{fmt(r.ingresos)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-400">Egresos</p><p className="text-sm font-semibold text-rose-600">{fmt(r.egresos)}</p></div>
          </div>
        )}
        <p className="text-sm text-slate-600 mb-3">Debería haber en caja: <span className="font-mono font-semibold">{fmt(esperado)}</span></p>
        <label className="block mb-3"><span className="block text-sm font-medium text-slate-700 mb-1">Efectivo contado *</span>
          <input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="numeric" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono" />
          {cuadre && <p className={`text-xs mt-1 font-semibold ${cuadre.c}`}>{cuadre.l}</p>}
        </label>
        <label className="block mb-2"><span className="block text-sm font-medium text-slate-700 mb-1">Efectivo retirado (depósito / entrega)</span>
          <input value={retirado} onChange={(e) => setRetirado(e.target.value)} inputMode="numeric" placeholder="0" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono" /></label>
        <p className="text-sm text-slate-600 mb-3">Queda en la caja: <span className="font-mono font-semibold">{fmt(dejado)}</span></p>
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observaciones (opcional)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm mb-2" />
        {err && <p className="text-sm text-rose-600 mb-1">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={cerrar} disabled={g} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? 'Cerrando…' : 'Cerrar y cuadrar'}</button>
        </div>
      </div>
    </div>
  )
}

// Editar una caja (sin nombre): saldo inicial y estado activo. Las cajas son de
// un usuario y se crean desde Cobros; aquí sólo se ajusta el saldo o se desactiva.
function CajaFormModal({ caja, onClose, onSaved }: { caja: CajaGestion | null; onClose: () => void; onSaved: () => void }) {
  const [saldoInicial, setSaldoInicial] = useState(caja ? String(caja.saldoInicial) : '')
  const [activo, setActivo] = useState(caja ? caja.activo : true)
  const [g, setG] = useState(false); const [err, setErr] = useState('')

  async function guardar() {
    if (!caja) { onClose(); return }
    setG(true); setErr('')
    try {
      await cajasService.actualizar(caja.id, { saldoInicial: Number(saldoInicial) || 0, activo })
      onSaved()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo guardar') } finally { setG(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">Caja Nº {caja?.numero ?? ''} · {caja?.usuarios.map((u) => u.user.name ?? u.user.email).filter(Boolean).join(', ') || 'sin usuario'}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        <label className="block mb-3"><span className="text-xs font-medium text-slate-500">Saldo inicial</span>
          <input value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} inputMode="numeric" placeholder="0" className="mt-1 w-40 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono" /></label>
        {caja && <label className="flex items-center gap-2 text-sm text-slate-700 mb-3"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Caja activa</label>}
        {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={guardar} disabled={g} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// Historial de pagos de una caja: cada período (apertura→cierre) con el flujo
// completo de pagos recibidos y egresos. Ordenado del más reciente al más antiguo.
function SesionesModal({ caja, onClose }: { caja: CajaGestion; onClose: () => void }) {
  const [sesiones, setSesiones] = useState<Sesion[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{ movimientos: FlujoMovimiento[]; resumen: FlujoResumen | null } | null>(null)
  useEffect(() => { cajasService.sesiones(caja.id).then((s) => setSesiones(s as Sesion[])).catch(() => setSesiones([])) }, [caja.id])
  useEffect(() => {
    if (!sel) { setDetalle(null); return }
    cajasService.sesion(caja.id, sel).then((d) => setDetalle(d as { movimientos: FlujoMovimiento[]; resumen: FlujoResumen | null })).catch(() => setDetalle(null))
  }, [sel, caja.id])

  const periodoLabel = (s: Sesion) => s.cerradaAt
    ? `${fechaHora(s.abiertaAt)} → ${fechaHora(s.cerradaAt)}`
    : `Abierta desde ${fechaHora(s.abiertaAt)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-900">Historial de pagos · Caja Nº {caja.numero}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">Cada bloque es un período de la caja (desde que se abrió hasta que se cerró) con todos los pagos que recibió.</p>
        {sesiones === null ? <p className="text-sm text-slate-400">Cargando…</p>
          : sesiones.length === 0 ? <p className="text-sm text-slate-400">Esta caja todavía no tiene movimientos.</p>
          : (
            <div className="space-y-2">
              {sesiones.map((s) => (
                <div key={s.id} className="border border-slate-100 rounded-xl">
                  <button onClick={() => setSel(sel === s.id ? null : s.id)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{periodoLabel(s)}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.estado === 'ABIERTA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}</span>
                      </p>
                      <p className="text-xs text-slate-500">Abrió {s.abiertaPorNombre ?? '—'}{s.cerradaAt ? ` · cerró ${s.cerradaPorNombre ?? '—'}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {s.estado === 'CERRADA'
                        ? <p className="text-xs font-mono text-slate-700">Contado {fmt(s.saldoReal ?? 0)}{s.diferencia ? <span className={s.diferencia < 0 ? 'text-rose-600' : 'text-emerald-600'}> ({s.diferencia > 0 ? '+' : ''}{fmt(s.diferencia)})</span> : ''}</p>
                        : <span className="text-xs text-cyan-700">{sel === s.id ? 'Ocultar' : 'Ver pagos'}</span>}
                    </div>
                  </button>
                  {sel === s.id && (
                    <div className="border-t border-slate-100 px-3 py-3">
                      {!detalle ? <p className="text-xs text-slate-400">Cargando pagos…</p>
                        : <FlujoCaja movimientos={detalle.movimientos} resumen={detalle.resumen} />}
                      {s.estado === 'CERRADA' && <Link to={`/print/caja/${caja.id}/${s.id}`} target="_blank" className="inline-block mt-3 text-xs font-semibold text-cyan-700">Imprimir / ver reporte de cierre →</Link>}
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

function TabBtn({ activo, onClick, label, count, tone }: { activo: boolean; onClick: () => void; label: string; count: number; tone: 'emerald' | 'slate' }) {
  const chip = tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${activo ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      {label} <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full ${chip}`}>{count}</span>
    </button>
  )
}
function Dato({ l, v, sub, tone }: { l: string; v: string; sub?: string; tone?: string }) {
  const c = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-600' : tone === 'cyan' ? 'text-cyan-700' : 'text-slate-800'
  return <div><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className={`text-sm font-semibold ${c}`}>{v}</p>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>
}
