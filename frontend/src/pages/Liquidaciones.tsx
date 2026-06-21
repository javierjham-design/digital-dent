import { Fragment, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { DoctorDTO, LiquidacionActivaDetalle, LiquidacionActivaResumen, LiquidacionAccion } from '@shared/types'
import { liquidacionesService, contratosService } from '@/services/caja.service'
import { usuariosService } from '@/services/equipo.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

interface LiqFin { id: string; periodo: string; totalBruto: number; totalLiquidado: number; estado: string; doctor?: { name: string | null; especialidad: string | null }; _count?: { items: number } }
interface LiqFinItem { id: string; prestacionNombre: string; pacienteNombre: string; diente: string | null; medioPago: string | null; montoPagado: number; comisionAplicada: number; montoLiquidado: number; fechaCompletado: string }
interface LiqFinDetalle extends LiqFin { items: LiqFinItem[] }
interface Contrato { id: string; tipo: string; porcentaje: number | null; montoFijo: number | null; activo: boolean; doctor?: { name: string | null } }

const fmt = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n))
const fmtFecha = (s: string) => new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ESTADOS = ['BORRADOR', 'APROBADA', 'PAGADA']
const ESTADO_COLOR: Record<string, string> = { BORRADOR: 'bg-slate-200 text-slate-600', APROBADA: 'bg-cyan-100 text-cyan-700', PAGADA: 'bg-emerald-100 text-emerald-700' }

export function Liquidaciones() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'activas' | 'finalizadas'>('activas')
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const [modal, setModal] = useState<null | 'contratos'>(null)
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  useEffect(() => { usuariosService.doctores().then(setDoctores).catch(() => {}) }, [])

  // Solo quien puede gestionar liquidaciones ve esta vista; el resto va a "Mis liquidaciones".
  if (!user?.permisos?.puedeGestionarLiquidaciones) return <Navigate to="/mis-liquidaciones" replace />

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Liquidaciones</h1>
        <button onClick={() => setModal('contratos')} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Contratos</button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([['activas', 'Activas'], ['finalizadas', 'Finalizadas']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {tab === 'activas' ? <ActivasTab notify={notify} /> : <FinalizadasTab notify={notify} />}

      {modal === 'contratos' && <ContratosModal doctores={doctores} onClose={() => setModal(null)} notify={notify} />}
    </div>
  )
}

// ── Activas (saldo corriente) ────────────────────────────────────────────────

function ActivasTab({ notify }: { notify: (t: string, ok?: boolean) => void }) {
  const [resumen, setResumen] = useState<LiquidacionActivaResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<LiquidacionActivaDetalle | null>(null)

  const cargar = () => { setCargando(true); liquidacionesService.activas().then(setResumen).catch(() => {}).finally(() => setCargando(false)) }
  useEffect(() => { cargar() }, [])

  const ver = async (doctorId: string) => {
    try { setDetalle(await liquidacionesService.activa(doctorId)) } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Profesional</th>
              <th className="text-right font-medium px-4 py-2.5">Realizado</th>
              <th className="text-right font-medium px-4 py-2.5">A pagar</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Cargando…</td></tr>
            ) : resumen.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Sin profesionales con contrato activo.</td></tr>
            ) : resumen.map((r) => (
              <tr key={r.doctorId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{r.doctor}</p>
                  <p className="text-xs text-slate-500">{r.especialidad ?? ''}{r.pendientes > 0 ? ` · ${r.pendientes} pendiente(s) de pago` : ''}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(r.realizado)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-cyan-700">{fmt(r.aPagar)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => ver(r.doctorId)} className="text-cyan-600 hover:text-cyan-800 text-sm font-medium">Ver detalle →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && <DetalleActivaModal detalle={detalle} onClose={() => setDetalle(null)} onFinalizado={() => { setDetalle(null); notify('Liquidación finalizada'); cargar() }} notify={notify} />}
    </>
  )
}

function explicacion(it: LiquidacionAccion, contrato: LiquidacionActivaDetalle['contrato']): string {
  const pct = contrato?.tipo === 'PORCENTAJE'
  if (!it.pagada) {
    return pct
      ? `Acción aún NO pagada por el paciente → no suma a "A pagar". Potencial: ${fmt(it.monto)} × ${contrato?.porcentaje}% = ${fmt(it.total)}.`
      : `Acción aún NO pagada → no suma. Potencial (monto fijo): ${fmt(it.total)}.`
  }
  return pct
    ? `Pagado ${fmt(it.montoPagado)} × ${contrato?.porcentaje}% = ${fmt((it.montoPagado * (contrato?.porcentaje ?? 0)) / 100)}  −  comisión ${fmt(it.comision)}  =  ${fmt(it.total)}.`
    : `Monto fijo ${fmt(contrato?.montoFijo ?? 0)}  −  comisión ${fmt(it.comision)}  =  ${fmt(it.total)}.`
}

function DetalleActivaModal({ detalle, onClose, onFinalizado, notify }: {
  detalle: LiquidacionActivaDetalle; onClose: () => void; onFinalizado: () => void; notify: (t: string, ok?: boolean) => void
}) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const pagables = detalle.items.filter((i) => i.pagada).length

  async function finalizar() {
    if (!confirm(`Finalizar la liquidación de ${detalle.doctor.name ?? ''}? Se emitirán ${pagables} acción(es) pagada(s) por ${fmt(detalle.aPagar)}. Las pendientes quedan para la próxima.`)) return
    setFinalizando(true)
    try { await liquidacionesService.finalizar(detalle.doctor.id); onFinalizado() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
    finally { setFinalizando(false) }
  }

  return (
    <Modal title={`Liquidación · ${detalle.doctor.name ?? detalle.doctor.email ?? ''}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-sm text-slate-500">
          {detalle.contrato
            ? `Contrato: ${detalle.contrato.tipo === 'PORCENTAJE' ? `${detalle.contrato.porcentaje}%` : `${fmt(detalle.contrato.montoFijo ?? 0)} por acción`}`
            : 'Sin contrato activo — no se puede liquidar.'}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">Realizado <b className="font-mono text-slate-700">{fmt(detalle.realizado)}</b></span>
          <span className="text-slate-500">A pagar <b className="font-mono text-cyan-700">{fmt(detalle.aPagar)}</b></span>
        </div>
      </div>

      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-3 py-2">Paciente</th>
              <th className="text-left font-medium px-3 py-2">Acción</th>
              <th className="text-left font-medium px-3 py-2">Fecha</th>
              <th className="text-right font-medium px-3 py-2">Monto</th>
              <th className="text-left font-medium px-3 py-2">Medio pago</th>
              <th className="text-right font-medium px-3 py-2">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detalle.items.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Sin acciones pendientes de liquidar.</td></tr>}
            {detalle.items.map((it) => (
              <Fragment key={it.tratamientoId}>
                <tr className={it.pagada ? '' : 'bg-rose-50/40'}>
                  <td className="px-3 py-2 text-slate-800">{it.pacienteNombre}</td>
                  <td className="px-3 py-2 text-slate-700">{it.accion}{it.pieza ? <span className="text-xs text-slate-400"> · {it.pieza}</span> : ''}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtFecha(it.fecha)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(it.monto)}</td>
                  <td className="px-3 py-2 text-slate-500">{it.medioPago}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${it.pagada ? 'text-slate-800' : 'text-rose-500'}`}>{fmt(it.total)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full align-middle mr-2 ${it.pagada ? 'bg-emerald-500' : 'bg-rose-500'}`} title={it.pagada ? 'Pagada' : 'Pendiente de pago'} />
                    <button onClick={() => setExpandido(expandido === it.tratamientoId ? null : it.tratamientoId)} className="text-xs text-slate-400 hover:text-cyan-600">Explicar</button>
                  </td>
                </tr>
                {expandido === it.tratamientoId && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-3 py-2 text-xs text-slate-600">{explicacion(it, detalle.contrato)}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">🔴 Rojo = acción evolucionada pero NO pagada por el paciente: el monto se muestra pero no suma a "A pagar" hasta que el paciente pague. 🟢 Verde = pagada, se liquida.</p>

      <div className="flex items-center justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">Cerrar</button>
        <button onClick={finalizar} disabled={finalizando || pagables === 0}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          {finalizando ? '…' : `Finalizar y pagar ${fmt(detalle.aPagar)}`}
        </button>
      </div>
    </Modal>
  )
}

// ── Finalizadas (snapshots) ──────────────────────────────────────────────────

function FinalizadasTab({ notify }: { notify: (t: string, ok?: boolean) => void }) {
  const [liqs, setLiqs] = useState<LiqFin[]>([])
  const [detalle, setDetalle] = useState<LiqFinDetalle | null>(null)
  const cargar = () => liquidacionesService.listar().then((l) => setLiqs(l as LiqFin[])).catch(() => {})
  useEffect(() => { cargar() }, [])

  async function cambiarEstado(id: string, estado: string) {
    try { await liquidacionesService.actualizar(id, { estado, ...(estado === 'PAGADA' ? { fechaPago: new Date().toISOString() } : {}) }); notify('Estado actualizado'); cargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {liqs.length === 0 ? <p className="px-5 py-8 text-center text-slate-500 text-sm">Sin liquidaciones finalizadas.</p> : liqs.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
            <button onClick={async () => setDetalle(await liquidacionesService.obtener(l.id) as LiqFinDetalle)} className="text-left min-w-0 flex-1">
              <p className="text-sm font-semibold text-cyan-800">{l.doctor?.name ?? '—'} · {l.periodo}</p>
              <p className="text-xs text-slate-500">{l._count?.items ?? 0} acción(es) · pagado al profesional {fmt(l.totalLiquidado)}</p>
            </button>
            <select value={l.estado} onChange={(e) => cambiarEstado(l.id, e.target.value)}
              className={`text-xs font-semibold rounded-lg px-2 py-1 border-0 ${ESTADO_COLOR[l.estado] ?? ''}`}>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
      </div>
      {detalle && <DetalleFinalizadaModal liq={detalle} onClose={() => setDetalle(null)} />}
    </>
  )
}

function DetalleFinalizadaModal({ liq, onClose }: { liq: LiqFinDetalle; onClose: () => void }) {
  return (
    <Modal title={`${liq.doctor?.name ?? ''} · ${liq.periodo}`} onClose={onClose} wide>
      <div className="flex justify-end gap-4 text-sm mb-3">
        <span className="text-slate-500">Pagado por pacientes <b className="font-mono">{fmt(liq.totalBruto)}</b></span>
        <span className="text-slate-500 font-semibold">Pagado al profesional <b className="font-mono text-cyan-700">{fmt(liq.totalLiquidado)}</b></span>
      </div>
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-3 py-2">Paciente</th>
              <th className="text-left font-medium px-3 py-2">Acción</th>
              <th className="text-left font-medium px-3 py-2">Medio pago</th>
              <th className="text-right font-medium px-3 py-2">Pagado</th>
              <th className="text-right font-medium px-3 py-2">Comisión</th>
              <th className="text-right font-medium px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {liq.items.map((it) => (
              <tr key={it.id}>
                <td className="px-3 py-2 text-slate-800">{it.pacienteNombre}</td>
                <td className="px-3 py-2 text-slate-700">{it.prestacionNombre}{it.diente ? <span className="text-xs text-slate-400"> · {it.diente}</span> : ''}</td>
                <td className="px-3 py-2 text-slate-500">{it.medioPago ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(it.montoPagado)}</td>
                <td className="px-3 py-2 text-right font-mono text-rose-500">−{fmt(it.comisionAplicada)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{fmt(it.montoLiquidado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

// ── Contratos ────────────────────────────────────────────────────────────────

function ContratosModal({ doctores, onClose, notify }: { doctores: DoctorDTO[]; onClose: () => void; notify: (t: string, ok?: boolean) => void }) {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [doctorId, setDoctorId] = useState(doctores[0]?.id ?? '')
  const [tipo, setTipo] = useState<'PORCENTAJE' | 'MONTO_FIJO'>('PORCENTAJE')
  const [valor, setValor] = useState('')
  const cargar = () => contratosService.listar().then((c) => setContratos(c as Contrato[])).catch(() => {})
  useEffect(() => { cargar() }, [])
  async function crear() {
    try {
      await contratosService.crear({ doctorId, tipo, ...(tipo === 'PORCENTAJE' ? { porcentaje: Number(valor) } : { montoFijo: Number(valor) }) })
      setValor(''); notify('Contrato creado'); cargar()
    } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  return (
    <Modal title="Contratos de profesionales" onClose={onClose}>
      <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
        {contratos.filter((c) => c.activo).map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
            <span className="text-slate-800">{c.doctor?.name ?? '—'}</span>
            <span className="text-slate-600">{c.tipo === 'PORCENTAJE' ? `${c.porcentaje}%` : fmt(c.montoFijo ?? 0)}</span>
          </div>
        ))}
        {contratos.filter((c) => c.activo).length === 0 && <p className="text-sm text-slate-500">Sin contratos activos.</p>}
      </div>
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nuevo contrato</p>
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
          {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'PORCENTAJE' | 'MONTO_FIJO')} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
            <option value="PORCENTAJE">Porcentaje</option><option value="MONTO_FIJO">Monto fijo</option>
          </select>
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === 'PORCENTAJE' ? '%' : '$'} inputMode="numeric" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
          <button onClick={crear} disabled={!doctorId || !valor} className="px-3 py-2 bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg">Crear</button>
        </div>
        <p className="text-[11px] text-slate-400">Crear un contrato desactiva el anterior del profesional.</p>
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        {children}
      </div>
    </div>
  )
}
