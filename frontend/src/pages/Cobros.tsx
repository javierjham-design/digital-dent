import { useCallback, useEffect, useState } from 'react'
import { cajasService, cobrosService } from '@/services/caja.service'
import { planesService } from '@/services/clinico.service'
import { mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'
import { PacienteBuscador } from '@/components/PacienteBuscador'

// ── Tipos ──
interface Resumen { ingresos: number; egresos: number; saldoEsperado: number; saldoApertura: number }
interface SesionAbierta { id: string; abiertaAt: string; saldoApertura: number; abiertaPorNombre?: string | null; resumen: Resumen | null }
interface SesionCerrada {
  id: string; estado: string; abiertaAt: string; cerradaAt: string | null
  saldoApertura: number; saldoEsperado?: number | null; saldoReal?: number | null; diferencia?: number | null
  totalIngresos?: number | null; totalEgresos?: number | null; observaciones?: string | null
  abiertaPorNombre?: string | null; cerradaPorNombre?: string | null
}
interface ResumenCaja {
  id: string; nombre: string; descripcion: string | null; saldoInicial: number
  sesionAbierta: SesionAbierta | null; ultimaCerrada: SesionCerrada | null
}
interface Movimiento { id: string; tipo: string; monto: number; descripcion: string; categoria: string | null; fecha: string; anulado: boolean; user?: { name: string | null } | null; cobro?: { numero: number } | null }
interface Cobro { id: string; numero: number; concepto: string; monto: number; estado: string; anulado: boolean; fechaPago: string | null; numeroReferencia?: string | null; numeroBoleta?: string | null; paciente: { nombre: string; apellido: string }; medioPago?: { nombre: string } | null }

// Plan (para recibir pago obligado a un plan)
interface CobroItemLite { monto: number; cobro?: { estado: string } | null }
interface TratNode { id: string; precio: number; descuento: number; diente: number | null; prestacion: { nombre: string }; cobroItems: CobroItemLite[] }
interface PlanDetalle { id: string; nombre: string; secciones: { tratamientos: TratNode[] }[]; tratamientos: TratNode[]; abonoLibre?: number }
interface PlanCard { id: string; nombre: string }

const fmt = (n: number | null | undefined) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n ?? 0))
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
  const [histCajaId, setHistCajaId] = useState<string | null>(null)
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
      <h1 className="text-2xl font-bold text-slate-900 mb-5">Cobros y cajas</h1>
      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {resumenes.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          No tienes cajas asignadas. Un administrador puede crearlas en Administración → (cajas).
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
                onPago={() => setModal({ kind: 'pago', cajaId: c.id, nombre: c.nombre })}
                onGasto={() => setModal({ kind: 'mov', cajaId: c.id, nombre: c.nombre })}
                onMovs={() => c.sesionAbierta && setModal({ kind: 'movs', cajaId: c.id, sesionId: c.sesionAbierta.id, nombre: c.nombre })}
                onCerrar={() => setModal({ kind: 'cerrar', cajaId: c.id, nombre: c.nombre, resumen: c.sesionAbierta?.resumen ?? null })} />
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
                  <p className="text-sm font-semibold text-slate-800">{c.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {c.ultimaCerrada?.cerradaAt
                      ? `Último cierre ${fechaHora(c.ultimaCerrada.cerradaAt)} · saldo ${fmt(c.ultimaCerrada.saldoReal)}`
                      : 'Sin cierres previos'}
                  </p>
                </div>
                <button onClick={() => setModal({ kind: 'abrir', cajaId: c.id, nombre: c.nombre })}
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
                onVer={(sesionId) => setModal({ kind: 'sesion', cajaId: c.id, sesionId, nombre: c.nombre })} />
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
              <p className="text-sm font-medium text-slate-800 truncate">#{c.numero} · {c.paciente.nombre} {c.paciente.apellido}</p>
              <p className="text-xs text-slate-500 truncate">{c.concepto}{c.medioPago ? ` · ${c.medioPago.nombre}` : ' · Efectivo'}{c.numeroReferencia ? ` · Ref ${c.numeroReferencia}` : ''}{c.numeroBoleta ? ` · Boleta ${c.numeroBoleta}` : ''}{c.fechaPago ? ` · ${fechaHora(c.fechaPago)}` : ''}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-mono text-sm text-slate-700">{fmt(c.monto)}</span>
              {!c.anulado && c.estado !== 'ANULADO' && (
                <button onClick={async () => { const m = prompt('Motivo de la anulación (mín. 4):'); if (m && m.length >= 4) { try { await cobrosService.anular(c.id, m); notify('Cobro anulado'); cargar() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } } }}
                  className="text-xs text-rose-400 hover:text-rose-600">Anular</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal?.kind === 'abrir' && <AbrirModal cajaId={modal.cajaId} nombre={modal.nombre} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Caja abierta'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'cerrar' && <CerrarModal cajaId={modal.cajaId} nombre={modal.nombre} resumen={modal.resumen} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Caja cerrada'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'mov' && <MovModal cajaId={modal.cajaId} nombre={modal.nombre} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Movimiento registrado'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'pago' && <PagoModal cajaId={modal.cajaId} nombre={modal.nombre} medios={medios} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Pago registrado'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal?.kind === 'movs' && <MovimientosModal cajaId={modal.cajaId} sesionId={modal.sesionId} nombre={modal.nombre} onClose={() => setModal(null)} />}
      {modal?.kind === 'sesion' && <SesionModal cajaId={modal.cajaId} sesionId={modal.sesionId} nombre={modal.nombre} onClose={() => setModal(null)} />}
    </div>
  )
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
        <Stat label="Apertura" value={fmt(r?.saldoApertura ?? s.saldoApertura)} />
        <Stat label="Ingresos" value={fmt(r?.ingresos)} tone="emerald" />
        <Stat label="Egresos" value={fmt(r?.egresos)} tone="rose" />
        <Stat label="Saldo esperado" value={fmt(r?.saldoEsperado)} tone="cyan" />
      </div>
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
  const [saldo, setSaldo] = useState('')
  const [obs, setObs] = useState('')
  const [g, setG] = useState(false)
  const dif = resumen && saldo !== '' ? Number(saldo) - resumen.saldoEsperado : null
  async function cerrar() { setG(true); try { await cajasService.cerrar(cajaId, Number(saldo), obs || undefined); onDone() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) } }
  return (
    <Modal title={`Cerrar ${nombre}`} onClose={onClose}>
      {resumen && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="Apertura" value={fmt(resumen.saldoApertura)} />
          <Stat label="Ingresos" value={fmt(resumen.ingresos)} tone="emerald" />
          <Stat label="Egresos" value={fmt(resumen.egresos)} tone="rose" />
        </div>
      )}
      {resumen && <p className="text-sm text-slate-600 mb-3">Saldo esperado en caja: <span className="font-mono font-semibold">{fmt(resumen.saldoEsperado)}</span></p>}
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Conteo real (arqueo)</span>
        <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="numeric" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {dif != null && <p className={`text-xs mt-1 ${dif === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>Diferencia: {fmt(dif)}</p>}
      </label>
      <div className="h-3" />
      <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observaciones (opcional)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      <Acciones onClose={onClose} onOk={cerrar} okLabel="Cerrar caja" loading={g} />
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

// Recibir pago: SIEMPRE asociado a un plan de tratamiento del paciente.
function PagoModal({ cajaId, nombre, medios, onClose, onDone, onError }: {
  cajaId: string; nombre: string; medios: MedioPagoDTO[]; onClose: () => void; onDone: () => void; onError: (m: string) => void
}) {
  const [pacienteId, setPacienteId] = useState('')
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [planId, setPlanId] = useState('')
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [medioPagoId, setMedioPagoId] = useState('')
  const [numeroReferencia, setNumeroReferencia] = useState('')
  const [numeroBoleta, setNumeroBoleta] = useState('')
  const [sel, setSel] = useState<Record<string, number>>({})
  const [abono, setAbono] = useState('')
  const [g, setG] = useState(false)

  const medioSel = medios.find((m) => m.id === medioPagoId)
  const requiereRef = Boolean(medioSel?.requiereReferencia)

  useEffect(() => {
    setPlanId(''); setDetalle(null); setSel({}); setAbono('')
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

  async function guardar() {
    const items: Record<string, unknown>[] = []
    for (const [tid, monto] of Object.entries(sel)) if (monto > 0) {
      const t = acciones.find((a) => a.id === tid)
      items.push({ tratamientoId: tid, descripcion: t?.prestacion.nombre ?? 'Acción', monto })
    }
    if (Number(abono) > 0) items.push({ planId, descripcion: 'Abono libre al plan', monto: Number(abono) })
    if (items.length === 0) { onError('Selecciona acciones del plan o ingresa un abono.'); return }
    if (requiereRef && !numeroReferencia.trim()) { onError(`Ingresa el N° de referencia de la operación (${medioSel?.nombre}).`); return }
    setG(true)
    try {
      await cobrosService.crear({
        pacienteId, cajaId, medioPagoId: medioPagoId || undefined, items,
        numeroReferencia: numeroReferencia.trim() || undefined, numeroBoleta: numeroBoleta.trim() || undefined,
      })
      onDone()
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) }
  }

  return (
    <Modal title={`Recibir pago · ${nombre}`} onClose={onClose}>
      <div className="mb-3"><PacienteBuscador onSelect={(p) => setPacienteId(p?.id ?? '')} placeholder="Buscar paciente…" /></div>

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
            <Acciones onClose={onClose} onOk={guardar} okLabel="Cobrar" loading={g} disabled={total <= 0 || (requiereRef && !numeroReferencia.trim())} />
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

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
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
