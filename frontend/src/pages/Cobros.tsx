import { useCallback, useEffect, useState } from 'react'
import { cajasService, cobrosService } from '@/services/caja.service'
import { planesService } from '@/services/clinico.service'
import { mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
import { pagosOnlineService } from '@/services/pagos-online.service'
import { ApiError } from '@/services/api'
import { PacienteBuscador } from '@/components/PacienteBuscador'
import { EnviarCorreoModal } from '@/components/EnviarCorreoModal'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ──
interface MetodoResumen { metodo: string; monto: number; cantidad: number }
interface Resumen { ingresos: number; egresos: number; saldoEsperado: number; saldoApertura: number; ingresosEfectivo?: number; ingresosOtros?: number; porMetodo?: MetodoResumen[] }
interface SesionAbierta { id: string; abiertaAt: string; saldoApertura: number; abiertaPorNombre?: string | null; resumen: Resumen | null }
interface SesionCerrada {
  id: string; estado: string; abiertaAt: string; cerradaAt: string | null
  saldoApertura: number; saldoEsperado?: number | null; saldoReal?: number | null; diferencia?: number | null
  totalIngresos?: number | null; totalEgresos?: number | null; observaciones?: string | null
  abiertaPorNombre?: string | null; cerradaPorNombre?: string | null
}
interface ResumenCaja {
  id: string; numero: number; nombre: string; descripcion: string | null; saldoInicial: number
  sesionAbierta: SesionAbierta | null; ultimaCerrada: SesionCerrada | null
}
const etiquetaCaja = (c: { numero?: number }) => `Caja N° ${c.numero ?? '—'}`
interface Movimiento { id: string; tipo: string; monto: number; descripcion: string; categoria: string | null; fecha: string; anulado: boolean; user?: { name: string | null } | null; cobro?: { numero: number } | null }
interface Cobro { id: string; numero: number; concepto: string; monto: number; estado: string; anulado: boolean; fechaPago: string | null; numeroReferencia?: string | null; numeroBoleta?: string | null; pacienteId: string; paciente: { nombre: string; apellido: string; email?: string | null }; medioPago?: { nombre: string } | null; caja?: { numero: number; nombre: string } | null }

// Plan (para recibir pago obligado a un plan)
interface CobroItemLite { monto: number; cobro?: { estado: string } | null }
interface TratNode { id: string; precio: number; descuento: number; diente: number | null; prestacion: { nombre: string }; cobroItems: CobroItemLite[] }
interface PlanDetalle { id: string; nombre: string; secciones: { tratamientos: TratNode[] }[]; tratamientos: TratNode[]; abonoLibre?: number }
interface PlanCard { id: string; nombre: string }

import { fmtMonto } from '@/lib/money'
const fmt = fmtMonto
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
const netoTrat = (t: { precio: number; descuento: number }) => Math.round(t.precio * (1 - (t.descuento || 0) / 100))
const pagadoTrat = (t: { cobroItems: CobroItemLite[] }) => t.cobroItems.filter((ci) => ci.cobro?.estado === 'PAGADO').reduce((s, ci) => s + ci.monto, 0)

const CATEGORIAS_EGRESO: [string, string][] = [
  ['INSUMOS', 'Insumos'], ['ARRIENDO', 'Arriendo'], ['SUELDO', 'Sueldo / honorario'],
  ['SERVICIOS', 'Servicios (luz, agua, etc.)'], ['RETIRO', 'Retiro de efectivo'], ['OTRO', 'Otro'],
]

type Modal =
  | { kind: 'abrir'; cajaId: string; nombre: string }
  | { kind: 'cerrar'; cajaId: string; nombre: string; resumen: Resumen | null }
  | { kind: 'mov'; cajaId: string; nombre: string }
  | { kind: 'pago'; cajaId: string; nombre: string }
  | { kind: 'movs'; cajaId: string; sesionId: string; nombre: string }
  | { kind: 'sesion'; cajaId: string; sesionId: string; nombre: string }
  | null

export function Cobros() {
  const [resumenes, setResumenes] = useState<ResumenCaja[]>([])
  const [medios, setMedios] = useState<MedioPagoDTO[]>([])
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [modal, setModal] = useState<Modal>(null)
  const { user } = useAuth()
  const puedeCrearCaja = user?.role === 'admin' || Boolean(user?.permisos?.puedeRecibirPagos)
  const [nuevaCaja, setNuevaCaja] = useState(false)
  const [histCajaId, setHistCajaId] = useState<string | null>(null)
  const [comprobante, setComprobante] = useState<Cobro | null>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargar = useCallback(() => {
    cajasService.resumen().then((r) => setResumenes(r as ResumenCaja[])).catch(() => {})
    cobrosService.listar().then((c) => setCobros((c as Cobro[]).slice(0, 20))).catch(() => {})
  }, [])
  useEffect(() => { cargar(); mediosPagoService.listar().then((m) => setMedios(m.filter((x) => x.activo))).catch(() => {}) }, [cargar])

  const abiertas = resumenes.filter((r) => r.sesionAbierta)
  const sinAbrir = resumenes.filter((r) => !r.sesionAbierta)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Cobros y cajas</h1>
        {puedeCrearCaja && resumenes.length === 0 && <button onClick={() => setNuevaCaja(true)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Crear mi caja</button>}
      </div>
      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {resumenes.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          No tienes cajas. {puedeCrearCaja ? 'Crea la tuya con "+ Nueva caja".' : 'Un administrador o gestor de cajas puede asignarte una.'}
        </div>
      )}

      {/* ── Cajas abiertas ── */}
      {abiertas.length > 0 && (
        <section className="mb-7">
          <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Cajas abiertas
          </h2>
          <div className="space-y-4">
            {abiertas.map((c) => (
              <CajaAbiertaCard key={c.id} caja={c}
                onPago={() => setModal({ kind: 'pago', cajaId: c.id, nombre: etiquetaCaja(c) })}
                onGasto={() => setModal({ kind: 'mov', cajaId: c.id, nombre: etiquetaCaja(c) })}
                onMovs={() => c.sesionAbierta && setModal({ kind: 'movs', cajaId: c.id, sesionId: c.sesionAbierta.id, nombre: etiquetaCaja(c) })}
                onCerrar={() => setModal({ kind: 'cerrar', cajaId: c.id, nombre: etiquetaCaja(c), resumen: c.sesionAbierta?.resumen ?? null })} />
            ))}
          </div>
        </section>
      )}

      {/* ── Cajas sin abrir ── */}
      {sinAbrir.length > 0 && (
        <section className="mb-7">
          <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Cajas sin abrir
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {sinAbrir.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{etiquetaCaja(c)}</p>
                  <p className="text-xs text-slate-500">
                    {c.ultimaCerrada?.cerradaAt
                      ? `Último cierre ${fechaHora(c.ultimaCerrada.cerradaAt)} · saldo ${fmt(c.ultimaCerrada.saldoReal)}`
                      : 'Sin cierres previos'}
                  </p>
                </div>
                <button onClick={() => setModal({ kind: 'abrir', cajaId: c.id, nombre: etiquetaCaja(c) })}
                  className="shrink-0 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Abrir caja</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Historial de cajas cerradas ── */}
      {resumenes.length > 0 && (
        <section className="mb-7">
          <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> Cajas cerradas — historial
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {resumenes.map((c) => (
              <HistorialCaja key={c.id} caja={c}
                abierto={histCajaId === c.id}
                onToggle={() => setHistCajaId((x) => (x === c.id ? null : c.id))}
                onVer={(sesionId) => setModal({ kind: 'sesion', cajaId: c.id, sesionId, nombre: etiquetaCaja(c) })} />
            ))}
          </div>
        </section>
      )}

      {/* ── Cobros recientes ── */}
      <h2 className="text-sm font-semibold text-slate-700 mb-2">Cobros recientes</h2>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cobros.length === 0 ? <p className="px-5 py-6 text-center text-slate-500 text-sm">Sin cobros.</p> : cobros.map((c) => (
          <div key={c.id} className={`flex items-center justify-between px-5 py-3 ${c.anulado ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-slate-800 truncate">#{c.numero} · {c.paciente.nombre} {c.paciente.apellido}</p>
                {c.caja && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">Caja Nº {c.caja.numero || '—'} · {c.caja.nombre}</span>}
              </div>
              <p className="text-xs text-slate-500 truncate">{c.concepto}{c.medioPago ? ` · ${c.medioPago.nombre}` : ' · Efectivo'}{c.numeroReferencia ? ` · Ref ${c.numeroReferencia}` : ''}{c.numeroBoleta ? ` · Boleta ${c.numeroBoleta}` : ''}{c.fechaPago ? ` · ${fechaHora(c.fechaPago)}` : ''}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-mono text-sm text-slate-700">{fmt(c.monto)}</span>
              {!c.anulado && c.estado !== 'ANULADO' && c.estado !== 'PAGADO' && <LinkPagoBtn cobroId={c.id} notify={notify} />}
              {!c.anulado && c.estado === 'PAGADO' && <button onClick={() => setComprobante(c)} className="text-xs font-semibold text-cyan-700 hover:text-cyan-900" title="Enviar comprobante por correo">✉ Comprobante</button>}
              {!c.anulado && c.estado !== 'ANULADO' && (
                <button onClick={async () => { const m = prompt('Motivo de la anulación (mín. 4):'); if (m && m.length >= 4) { try { await cobrosService.anular(c.id, m); notify('Cobro anulado'); cargar() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } } }}
                  className="text-xs text-rose-400 hover:text-rose-600">Anular</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {nuevaCaja && <NuevaCajaModal onClose={() => setNuevaCaja(false)} onDone={() => { setNuevaCaja(false); notify('Caja creada'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'abrir' && <AbrirModal cajaId={modal.cajaId} nombre={modal.nombre} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Caja abierta'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'cerrar' && <CerrarModal cajaId={modal.cajaId} nombre={modal.nombre} resumen={modal.resumen} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Caja cerrada'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'mov' && <MovModal cajaId={modal.cajaId} nombre={modal.nombre} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Movimiento registrado'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'pago' && <PagoModal cajaId={modal.cajaId} nombre={modal.nombre} medios={medios} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Pago registrado'); cargar() }} onError={(m) => notify(m, false)} />}
      {comprobante && (
        <EnviarCorreoModal
          tipo="COMPROBANTE" titulo="comprobante"
          asuntoDefault={`Comprobante de pago Nº ${comprobante.numero}`}
          pacienteId={comprobante.pacienteId} pacienteNombre={`${comprobante.paciente.nombre} ${comprobante.paciente.apellido}`}
          defaultEmail={comprobante.paciente.email}
          mensajeDefault={`Comprobante de tu pago Nº ${comprobante.numero} por ${fmt(comprobante.monto)}${comprobante.medioPago ? ` · ${comprobante.medioPago.nombre}` : ''}${comprobante.fechaPago ? ` · ${fechaHora(comprobante.fechaPago)}` : ''}. ¡Gracias!`}
          onClose={() => setComprobante(null)} />
      )}
      {modal?.kind === 'movs' && <MovimientosModal cajaId={modal.cajaId} sesionId={modal.sesionId} nombre={modal.nombre} onClose={() => setModal(null)} />}
      {modal?.kind === 'sesion' && <SesionModal cajaId={modal.cajaId} sesionId={modal.sesionId} nombre={modal.nombre} onClose={() => setModal(null)} />}
    </div>
  )
}

// Botón "Link de pago": genera un link de Flow para el cobro y lo copia. Si Flow
// no está configurado, avisa (sin romper). El link también queda visible para copiar.
function LinkPagoBtn({ cobroId, notify }: { cobroId: string; notify: (m: string, ok?: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  async function generar() {
    setBusy(true)
    try {
      const r = await pagosOnlineService.crearLink(cobroId)
      if (r.estado === 'ok') {
        setUrl(r.url)
        navigator.clipboard?.writeText(r.url).then(() => notify('Link de pago copiado')).catch(() => notify('Link generado'))
      } else {
        notify(r.mensaje, false)
      }
    } catch (e) { notify(e instanceof ApiError ? e.message : 'No se pudo generar el link', false) } finally { setBusy(false) }
  }
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => navigator.clipboard?.writeText(url).catch(() => {})}
      className="text-xs text-cyan-600 hover:text-cyan-800 font-medium" title="Abrir/copiar link de pago">Link ✓ (copiar)</a>
  )
  return <button onClick={generar} disabled={busy} className="text-xs text-cyan-600 hover:text-cyan-800 font-medium disabled:opacity-50">{busy ? '…' : 'Link de pago'}</button>
}

// ── Tarjeta de caja abierta ──
function CajaAbiertaCard({ caja, onPago, onGasto, onMovs, onCerrar }: {
  caja: ResumenCaja; onPago: () => void; onGasto: () => void; onMovs: () => void; onCerrar: () => void
}) {
  const s = caja.sesionAbierta!
  const r = s.resumen
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-900">{caja.nombre}</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Abierta</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Abierta el {fechaHora(s.abiertaAt)}{s.abiertaPorNombre ? ` · ${s.abiertaPorNombre}` : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onPago} className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Recibir pago</button>
          <button onClick={onGasto} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Registrar gasto</button>
          <button onClick={onMovs} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Movimientos</button>
          <button onClick={onCerrar} className="px-3.5 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-semibold rounded-xl">Cerrar caja</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Apertura (efectivo)" value={fmt(r?.saldoApertura ?? s.saldoApertura)} />
        <Stat label="Recaudación" value={fmt(r?.ingresos)} tone="emerald" />
        <Stat label="Egresos" value={fmt(r?.egresos)} tone="rose" />
        <Stat label="Efectivo esperado" value={fmt(r?.saldoEsperado)} tone="cyan" />
      </div>
      {r && r.porMetodo && r.porMetodo.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {r.porMetodo.map((m) => (
            <span key={m.metodo} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{m.metodo}: <span className="font-mono font-semibold">{fmt(m.monto)}</span> ({m.cantidad})</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Historial de cierres de una caja ──
function HistorialCaja({ caja, abierto, onToggle, onVer }: {
  caja: ResumenCaja; abierto: boolean; onToggle: () => void; onVer: (sesionId: string) => void
}) {
  const [sesiones, setSesiones] = useState<SesionCerrada[] | null>(null)
  useEffect(() => {
    if (abierto && sesiones === null) {
      cajasService.sesiones(caja.id).then((s) => setSesiones((s as SesionCerrada[]).filter((x) => x.estado === 'CERRADA'))).catch(() => setSesiones([]))
    }
  }, [abierto, sesiones, caja.id])
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 text-left">
        <span className="text-sm font-semibold text-slate-800">{caja.nombre}</span>
        <span className="text-xs text-slate-400">{abierto ? 'Ocultar' : 'Ver cierres'}</span>
      </button>
      {abierto && (
        <div className="px-5 pb-4">
          {sesiones === null ? <p className="text-xs text-slate-400 py-2">Cargando…</p>
            : sesiones.length === 0 ? <p className="text-xs text-slate-400 py-2">Esta caja no tiene cierres registrados.</p> : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {sesiones.map((se) => (
                  <div key={se.id} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/50">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{se.cerradaAt ? fechaHora(se.cerradaAt) : '—'}</p>
                      <p className="text-xs text-slate-500">
                        Real {fmt(se.saldoReal)} · esperado {fmt(se.saldoEsperado)}
                        {se.diferencia != null && se.diferencia !== 0 && <span className="text-amber-600"> · dif {fmt(se.diferencia)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => onVer(se.id)} className="text-xs font-semibold text-cyan-700 hover:underline">Detalle</button>
                      <a href={`/print/caja/${caja.id}/${se.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 hover:text-slate-800">Imprimir</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: string }) {
  const c: Record<string, string> = { slate: 'text-slate-900', emerald: 'text-emerald-600', rose: 'text-rose-600', cyan: 'text-cyan-700' }
  return <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">{label}</p><p className={`text-lg font-bold font-mono ${c[tone]}`}>{value}</p></div>
}

// ── Modales de operación de caja ──
// Crear una caja nueva (el creador queda como responsable). Para el flujo diario
// de quien recibe pagos: crea su caja, la abre y luego la cierra.
function NuevaCajaModal({ onClose, onDone, onError }: { onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [saldoInicial, setSaldoInicial] = useState('')
  const [g, setG] = useState(false); const [err, setErr] = useState('')
  async function crear() {
    setG(true); setErr('')
    try { await cajasService.crear({ saldoInicial: Number(saldoInicial) || 0 }); onDone() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo crear la caja'); onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) }
  }
  return (
    <Modal title="Mi caja" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Cada usuario tiene UNA caja propia (sin nombre), identificada por su número. Es exclusiva tuya: sólo tú recibes pagos y la cierras. Si ya la tenías, se usa esa misma.</p>
      <label className="block"><span className="text-xs font-medium text-slate-500">Saldo inicial (opcional)</span>
        <input value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} inputMode="numeric" placeholder="0" className="mt-1 w-40 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      <div className="flex gap-2 pt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={crear} disabled={g} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? 'Creando…' : 'Crear mi caja'}</button>
      </div>
    </Modal>
  )
}

function AbrirModal({ cajaId, nombre, onClose, onDone, onError }: { cajaId: string; nombre: string; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [saldo, setSaldo] = useState('')
  const [sugerido, setSugerido] = useState<number | null>(null)
  const [g, setG] = useState(false)
  useEffect(() => { cajasService.saldoSugerido(cajaId).then((r) => { setSugerido(r.saldoSugerido); setSaldo(String(r.saldoSugerido)) }).catch(() => {}) }, [cajaId])
  async function abrir() { setG(true); try { await cajasService.abrir(cajaId, Number(saldo)); onDone() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) } }
  return (
    <Modal title={`Abrir ${nombre}`} onClose={onClose}>
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Conteo inicial declarado</span>
        <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="numeric" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {sugerido != null && <p className="text-xs text-slate-500 mt-1">Sugerido: {fmt(sugerido)}</p>}
      </label>
      <Acciones onClose={onClose} onOk={abrir} okLabel="Abrir" loading={g} />
    </Modal>
  )
}

function CerrarModal({ cajaId, nombre, resumen, onClose, onDone, onError }: { cajaId: string; nombre: string; resumen: Resumen | null; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [contado, setContado] = useState('')
  const [retirado, setRetirado] = useState('')
  const [obs, setObs] = useState('')
  const [g, setG] = useState(''); const [err, setErr] = useState('')
  const esperado = resumen?.saldoEsperado ?? 0
  const nContado = Number(contado) || 0
  const nRetirado = Number(retirado) || 0
  const dejado = Math.max(0, nContado - nRetirado)
  const dif = contado !== '' ? nContado - esperado : null
  const cuadre = dif == null ? null : dif === 0 ? { l: 'Caja cuadrada', c: 'text-emerald-600' } : dif > 0 ? { l: `Sobrante ${fmt(dif)}`, c: 'text-amber-600' } : { l: `Faltante ${fmt(-dif)}`, c: 'text-rose-600' }

  async function cerrar() {
    if (contado === '') { setErr('Ingresa el efectivo contado.'); return }
    if (nRetirado > nContado) { setErr('No puedes retirar más de lo contado.'); return }
    setG('cerrar'); setErr('')
    try { await cajasService.cerrar(cajaId, { saldoReal: nContado, efectivoRetirado: nRetirado, efectivoDejado: dejado, observaciones: obs || undefined }); onDone() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo cerrar'); onError(e instanceof ApiError ? e.message : 'Error') } finally { setG('') }
  }
  return (
    <Modal title={`Cerrar ${nombre}`} onClose={onClose}>
      {resumen && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="Apertura (efectivo)" value={fmt(resumen.saldoApertura)} />
          <Stat label="Ingresos en efectivo" value={fmt(resumen.ingresosEfectivo ?? resumen.ingresos)} tone="emerald" />
          <Stat label="Egresos" value={fmt(resumen.egresos)} tone="rose" />
        </div>
      )}
      {resumen && resumen.porMetodo && resumen.porMetodo.filter((m) => m.metodo !== 'Efectivo').length > 0 && (
        <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-500 mb-1">Otros medios (no cuentan en el efectivo):</p>
          <div className="flex flex-wrap gap-2">
            {resumen.porMetodo.filter((m) => m.metodo !== 'Efectivo').map((m) => (
              <span key={m.metodo}>{m.metodo}: <span className="font-mono font-semibold">{fmt(m.monto)}</span> ({m.cantidad})</span>
            ))}
          </div>
        </div>
      )}
      <p className="text-sm text-slate-600 mb-3">Efectivo que debería haber en caja: <span className="font-mono font-semibold">{fmt(esperado)}</span></p>

      <label className="block mb-3">
        <span className="block text-sm font-medium text-slate-700 mb-1">Efectivo contado (arqueo) *</span>
        <input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="numeric" placeholder="Cuenta el efectivo real de la caja" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {cuadre && <p className={`text-xs mt-1 font-semibold ${cuadre.c}`}>{cuadre.l}</p>}
      </label>

      <label className="block mb-2">
        <span className="block text-sm font-medium text-slate-700 mb-1">Efectivo retirado (depósito / entrega)</span>
        <input value={retirado} onChange={(e) => setRetirado(e.target.value)} inputMode="numeric" placeholder="0" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      </label>
      <p className="text-sm text-slate-600 mb-3">Queda en la caja para la próxima apertura: <span className="font-mono font-semibold">{fmt(dejado)}</span></p>

      <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observaciones (opcional)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2" />
      {err && <p className="text-sm text-rose-600 mb-1">{err}</p>}
      <Acciones onClose={onClose} onOk={cerrar} okLabel="Cerrar caja y cuadrar" loading={g === 'cerrar'} />
    </Modal>
  )
}

// Movimiento manual: gasto (egreso con categoría) o ingreso suelto.
function MovModal({ cajaId, nombre, onClose, onDone, onError }: { cajaId: string; nombre: string; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [tipo, setTipo] = useState<'EGRESO' | 'INGRESO'>('EGRESO')
  const [categoria, setCategoria] = useState('INSUMOS')
  const [monto, setMonto] = useState('')
  const [desc, setDesc] = useState('')
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    try {
      await cajasService.crearMovimiento(cajaId, { tipo, monto: Number(monto), descripcion: desc, ...(tipo === 'EGRESO' ? { categoria } : {}) })
      onDone()
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) }
  }
  return (
    <Modal title={`Movimiento · ${nombre}`} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {(['EGRESO', 'INGRESO'] as const).map((t) => (
          <button key={t} onClick={() => setTipo(t)} className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border-2 ${tipo === t ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'}`}>{t === 'EGRESO' ? 'Gasto (egreso)' : 'Ingreso'}</button>
        ))}
      </div>
      {tipo === 'EGRESO' && (
        <label className="block mb-2">
          <span className="block text-xs font-medium text-slate-500 mb-1">Categoría del gasto</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
            {CATEGORIAS_EGRESO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}
      <input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto" inputMode="numeric" className="w-full mb-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={tipo === 'EGRESO' ? 'Descripción del gasto (a quién/por qué)' : 'Descripción'} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      <p className="text-[11px] text-slate-400 mt-2">El gasto se paga con el efectivo de esta caja y queda en el arqueo de cierre.</p>
      <Acciones onClose={onClose} onOk={guardar} okLabel="Registrar" loading={g} disabled={!monto || Number(monto) <= 0 || !desc.trim()} />
    </Modal>
  )
}

// Recibir pago: SIEMPRE asociado a un plan de tratamiento del paciente. Dos pasos:
// (1) ingresar datos, (2) pantalla de CONFIRMACIÓN antes de registrar el cobro.
function PagoModal({ cajaId, nombre, medios, onClose, onDone, onError }: {
  cajaId: string; nombre: string; medios: MedioPagoDTO[]; onClose: () => void; onDone: () => void; onError: (m: string) => void
}) {
  const [pacienteId, setPacienteId] = useState('')
  const [pacienteNombre, setPacienteNombre] = useState('')
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [planId, setPlanId] = useState('')
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [medioPagoId, setMedioPagoId] = useState('')
  const [numeroReferencia, setNumeroReferencia] = useState('')
  const [numeroBoleta, setNumeroBoleta] = useState('')
  const [sel, setSel] = useState<Record<string, number>>({})
  const [abono, setAbono] = useState('')
  const [g, setG] = useState(false)
  const [linkGen, setLinkGen] = useState(false)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [paso, setPaso] = useState<'form' | 'confirmar'>('form')
  const [err, setErr] = useState('')

  const medioSel = medios.find((m) => m.id === medioPagoId)
  const requiereRef = Boolean(medioSel?.requiereReferencia)
  const planSel = planes.find((p) => p.id === planId)

  useEffect(() => {
    setPlanId(''); setDetalle(null); setSel({}); setAbono(''); setPaso('form'); setErr('')
    if (!pacienteId) { setPlanes([]); return }
    planesService.listar(pacienteId).then((p) => { const ps = p as PlanCard[]; setPlanes(ps); setPlanId(ps[0]?.id ?? '') }).catch(() => {})
  }, [pacienteId])
  useEffect(() => {
    setSel({}); setAbono('')
    if (planId) planesService.obtener(planId).then((d) => setDetalle(d as PlanDetalle)).catch(() => {})
    else setDetalle(null)
  }, [planId])

  const acciones = detalle ? [...detalle.secciones.flatMap((s) => s.tratamientos), ...detalle.tratamientos] : []
  const restante = (t: TratNode) => Math.max(0, netoTrat(t) - pagadoTrat(t))
  const pendientes = acciones.filter((t) => restante(t) > 0)
  const total = Object.values(sel).reduce((s, n) => s + n, 0) + (Number(abono) || 0)
  const toggle = (t: TratNode) => setSel((s) => { const n = { ...s }; if (n[t.id] != null) delete n[t.id]; else n[t.id] = restante(t); return n })

  // Detalle legible de lo que se va a cobrar (para la confirmación).
  function itemsDetalle(): { descripcion: string; monto: number }[] {
    const out: { descripcion: string; monto: number }[] = []
    for (const [tid, monto] of Object.entries(sel)) if (monto > 0) {
      const t = acciones.find((a) => a.id === tid)
      out.push({ descripcion: `${t?.prestacion.nombre ?? 'Acción'}${t?.diente ? ` · ${t.diente}` : ''}`, monto })
    }
    if (Number(abono) > 0) out.push({ descripcion: 'Abono libre al plan', monto: Number(abono) })
    return out
  }
  const buildItems = (): Record<string, unknown>[] => {
    const items: Record<string, unknown>[] = []
    for (const [tid, monto] of Object.entries(sel)) if (monto > 0) {
      const t = acciones.find((a) => a.id === tid)
      items.push({ tratamientoId: tid, descripcion: t?.prestacion.nombre ?? 'Acción', monto })
    }
    if (Number(abono) > 0) items.push({ planId, descripcion: 'Abono libre al plan', monto: Number(abono) })
    return items
  }

  // Paso 1 → validar y pasar a la confirmación.
  function revisar() {
    setErr('')
    if (total <= 0) { setErr('Selecciona acciones del plan o ingresa un abono.'); return }
    if (requiereRef && !numeroReferencia.trim()) { setErr(`Ingresa el N° de referencia de la operación (${medioSel?.nombre}).`); return }
    setPaso('confirmar')
  }

  async function guardar() {
    setG(true); setErr('')
    try {
      await cobrosService.crear({
        pacienteId, cajaId, medioPagoId: medioPagoId || undefined, items: buildItems(),
        numeroReferencia: numeroReferencia.trim() || undefined, numeroBoleta: numeroBoleta.trim() || undefined,
      })
      onDone()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo registrar el cobro'); onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) }
  }

  // Genera un link de pago Flow (crea un cobro PENDIENTE) para enviárselo al paciente.
  async function generarLink() {
    setLinkGen(true); setErr('')
    try {
      const r = await cobrosService.linkPago({ pacienteId, items: buildItems() })
      setLinkUrl(r.url)
      navigator.clipboard?.writeText(r.url).catch(() => {})
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo generar el link de pago') } finally { setLinkGen(false) }
  }

  const medioTxt = medioSel ? `${medioSel.nombre}${medioSel.comision ? ` (${medioSel.comision}%)` : ''}` : 'Efectivo / sin comisión'

  return (
    <Modal title={`Recibir pago · ${nombre}`} onClose={onClose} size="lg">
      {paso === 'confirmar' ? (
        // ── Paso 2: confirmación ──
        <div>
          <p className="text-sm text-slate-500 mb-3">Revisa que el cobro sea correcto antes de registrarlo:</p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Paciente</span><span className="font-semibold text-slate-800">{pacienteNombre || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Plan</span><span className="text-slate-800">{planSel ? `#${planSel.id.slice(-4)} · ${planSel.nombre}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Medio de pago</span><span className="text-slate-800">{medioTxt}</span></div>
            {numeroReferencia.trim() && <div className="flex justify-between"><span className="text-slate-500">Referencia</span><span className="text-slate-800">{numeroReferencia.trim()}</span></div>}
            {numeroBoleta.trim() && <div className="flex justify-between"><span className="text-slate-500">Boleta</span><span className="text-slate-800">{numeroBoleta.trim()}</span></div>}
            <div className="border-t border-slate-200 pt-2 mt-2">
              <p className="text-xs font-semibold text-slate-500 mb-1">Se cobra:</p>
              {itemsDetalle().map((it, i) => (
                <div key={i} className="flex justify-between text-slate-700"><span className="truncate pr-2">{it.descripcion}</span><span className="font-mono shrink-0">{fmt(it.monto)}</span></div>
              ))}
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>Total a recibir</span><span>{fmt(total)}</span></div>
          </div>
          {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
          <div className="flex gap-2 pt-4">
            <button onClick={() => { setPaso('form'); setErr('') }} disabled={g} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">← Volver a editar</button>
            <button onClick={guardar} disabled={g} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? 'Registrando…' : `Confirmar cobro · ${fmt(total)}`}</button>
          </div>
        </div>
      ) : (
        // ── Paso 1: datos ──
        <>
          <div className="mb-3"><PacienteBuscador onSelect={(p) => { setPacienteId(p?.id ?? ''); setPacienteNombre(p ? `${p.nombre} ${p.apellido}` : '') }} placeholder="Buscar paciente…" /></div>

          {!pacienteId ? <p className="text-xs text-slate-400">Busca un paciente para ver sus planes de tratamiento.</p>
            : planes.length === 0 ? <p className="text-sm text-amber-600">Este paciente no tiene planes de tratamiento. Todo pago debe asociarse a un plan: crea uno en su ficha.</p> : (
              <>
                <label className="block mb-3">
                  <span className="text-xs font-medium text-slate-500">Plan de tratamiento</span>
                  <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {planes.map((p) => <option key={p.id} value={p.id}>#{p.id.slice(-4)} · {p.nombre}</option>)}
                  </select>
                </label>

                <div className="border border-slate-100 rounded-xl p-3 mb-3">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Pagar acciones pendientes</p>
                  {pendientes.length === 0 ? <p className="text-xs text-slate-400">No hay acciones pendientes de pago.</p> : (
                    <div className="space-y-1.5">
                      {pendientes.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={sel[t.id] != null} onChange={() => toggle(t)} />
                          <span className="flex-1 truncate text-slate-700">{t.prestacion.nombre}{t.diente ? ` · ${t.diente}` : ''}</span>
                          <span className="text-xs text-slate-400 shrink-0">resta {fmt(restante(t))}</span>
                          {sel[t.id] != null && (
                            <input type="number" value={sel[t.id]} onChange={(e) => setSel((s) => ({ ...s, [t.id]: Number(e.target.value) || 0 }))} className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <label className="block mb-3">
                  <span className="text-sm font-semibold text-slate-800">Abono libre al plan</span>
                  <input type="number" value={abono} onChange={(e) => setAbono(e.target.value)} placeholder="Monto" className="mt-1 w-40 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                </label>

                <select value={medioPagoId} onChange={(e) => setMedioPagoId(e.target.value)} className="w-full mb-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Efectivo / sin comisión</option>
                  {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.comision ? ` (${m.comision}%)` : ''}</option>)}
                </select>
                {requiereRef && (
                  <input value={numeroReferencia} onChange={(e) => setNumeroReferencia(e.target.value)} placeholder="N° de referencia de la operación *"
                    className="w-full mb-2 px-3 py-2.5 border border-cyan-300 bg-cyan-50/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                )}
                <input value={numeroBoleta} onChange={(e) => setNumeroBoleta(e.target.value)} placeholder="N° de boleta (opcional)"
                  className="w-full mb-3 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <p className="text-right text-sm font-semibold text-slate-800 mb-1">Total: {fmt(total)}</p>

                {/* Link de pago online (Flow): crea un cobro pendiente y genera el link para enviar al paciente. */}
                {linkUrl ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Link de pago generado (copiado). Envíalo al paciente:</p>
                    <div className="flex items-center gap-2">
                      <input readOnly value={linkUrl} className="flex-1 min-w-0 px-2 py-1.5 border border-emerald-200 rounded-lg text-xs font-mono bg-white" onFocus={(e) => e.currentTarget.select()} />
                      <button onClick={() => navigator.clipboard?.writeText(linkUrl)} className="text-xs font-semibold text-emerald-700 shrink-0">Copiar</button>
                      <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-cyan-700 shrink-0">Abrir</a>
                    </div>
                    <button onClick={onClose} className="mt-2 text-xs text-slate-500 hover:text-slate-700">Cerrar</button>
                  </div>
                ) : (
                  <button onClick={generarLink} disabled={linkGen || total <= 0} className="w-full mb-2 px-4 py-2.5 border border-cyan-300 text-cyan-700 hover:bg-cyan-50 disabled:opacity-50 text-sm font-semibold rounded-xl">
                    {linkGen ? 'Generando…' : '🔗 Generar link de pago (Flow)'}
                  </button>
                )}

                {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
                <Acciones onClose={onClose} onOk={revisar} okLabel="Revisar y confirmar →" loading={false} disabled={total <= 0 || (requiereRef && !numeroReferencia.trim())} />
              </>
            )}
        </>
      )}
    </Modal>
  )
}

// Movimientos de la sesión abierta (vista rápida).
function MovimientosModal({ cajaId, sesionId, nombre, onClose }: { cajaId: string; sesionId: string; nombre: string; onClose: () => void }) {
  const [movs, setMovs] = useState<Movimiento[] | null>(null)
  useEffect(() => { cajasService.sesion(cajaId, sesionId).then((d) => setMovs((d as { movimientos: Movimiento[] }).movimientos)).catch(() => setMovs([])) }, [cajaId, sesionId])
  return (
    <Modal title={`Movimientos · ${nombre}`} onClose={onClose}>
      {movs === null ? <p className="text-sm text-slate-400">Cargando…</p>
        : movs.length === 0 ? <p className="text-sm text-slate-400">Sin movimientos en esta sesión.</p> : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {movs.map((m) => (
              <div key={m.id} className={`flex items-center justify-between py-2.5 ${m.anulado ? 'opacity-40 line-through' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.descripcion}</p>
                  <p className="text-xs text-slate-500">{fechaHora(m.fecha)}{m.categoria ? ` · ${m.categoria}` : ''}{m.user?.name ? ` · ${m.user.name}` : ''}</p>
                </div>
                <span className={`font-mono text-sm font-semibold shrink-0 ${m.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.tipo === 'INGRESO' ? '+' : '−'}{fmt(m.monto)}</span>
              </div>
            ))}
          </div>
        )}
    </Modal>
  )
}

// Detalle de una sesión cerrada (con imprimible).
function SesionModal({ cajaId, sesionId, nombre, onClose }: { cajaId: string; sesionId: string; nombre: string; onClose: () => void }) {
  const [data, setData] = useState<{ sesion: SesionCerrada; movimientos: Movimiento[]; resumen: Resumen | null } | null>(null)
  useEffect(() => { cajasService.sesion(cajaId, sesionId).then((d) => setData(d as never)).catch(() => {}) }, [cajaId, sesionId])
  return (
    <Modal title={`Cierre · ${nombre}`} onClose={onClose}>
      {!data ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Stat label="Apertura" value={fmt(data.sesion.saldoApertura)} />
            <Stat label="Esperado" value={fmt(data.sesion.saldoEsperado)} tone="cyan" />
            <Stat label="Conteo real" value={fmt(data.sesion.saldoReal)} />
            <Stat label="Diferencia" value={fmt(data.sesion.diferencia)} tone={data.sesion.diferencia ? 'rose' : 'emerald'} />
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Abrió {data.sesion.abiertaPorNombre ?? '—'} · {fechaHora(data.sesion.abiertaAt)}<br />
            Cerró {data.sesion.cerradaPorNombre ?? '—'} · {data.sesion.cerradaAt ? fechaHora(data.sesion.cerradaAt) : '—'}
          </p>
          {data.sesion.observaciones && <p className="text-xs text-slate-600 mb-2 italic">“{data.sesion.observaciones}”</p>}
          <div className="divide-y divide-slate-100 max-h-[40vh] overflow-y-auto border-t border-slate-100 mt-2">
            {data.movimientos.map((m) => (
              <div key={m.id} className={`flex items-center justify-between py-2 ${m.anulado ? 'opacity-40 line-through' : ''}`}>
                <div className="min-w-0"><p className="text-sm text-slate-700 truncate">{m.descripcion}</p><p className="text-xs text-slate-400">{fechaHora(m.fecha)}{m.categoria ? ` · ${m.categoria}` : ''}</p></div>
                <span className={`font-mono text-sm shrink-0 ${m.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.tipo === 'INGRESO' ? '+' : '−'}{fmt(m.monto)}</span>
              </div>
            ))}
          </div>
          <a href={`/print/caja/${cajaId}/${sesionId}`} target="_blank" rel="noopener noreferrer" className="block w-full text-center mt-4 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold">Imprimir cierre</a>
        </>
      )}
    </Modal>
  )
}

function Modal({ title, children, onClose, size = 'md' }: { title: string; children: React.ReactNode; onClose: () => void; size?: 'md' | 'lg' }) {
  const maxW = size === 'lg' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${maxW} max-h-[92vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        {children}
      </div>
    </div>
  )
}
function Acciones({ onClose, onOk, okLabel, loading, disabled }: { onClose: () => void; onOk: () => void; okLabel: string; loading: boolean; disabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-5">
      <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
      <button onClick={onOk} disabled={loading || disabled} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{loading ? '…' : okLabel}</button>
    </div>
  )
}
