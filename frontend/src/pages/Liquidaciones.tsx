import { Fragment, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { LiquidacionActivaDetalle, LiquidacionActivaResumen, LiquidacionAccion } from '@shared/types'
import { liquidacionesService, type FinalizarTodasResultado } from '@/services/caja.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { AdjuntosLiquidacion } from '@/components/AdjuntosLiquidacion'

interface LiqFin { id: string; periodo: string; totalBruto: number; totalLiquidado: number; estado: string; doctor?: { name: string | null; especialidad: string | null }; _count?: { items: number } }
interface LiqFinItem { id: string; prestacionNombre: string; pacienteNombre: string; diente: string | null; medioPago: string | null; montoPagado: number; comisionAplicada: number; montoLiquidado: number; fechaCompletado: string }
interface LiqFinDetalle extends LiqFin { items: LiqFinItem[] }

import { fmtMonto } from '@/lib/money'
const fmt = fmtMonto
const fmtFecha = (s: string) => new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ESTADOS = ['BORRADOR', 'APROBADA', 'PAGADA']
const ESTADO_COLOR: Record<string, string> = { BORRADOR: 'bg-slate-200 text-slate-600', APROBADA: 'bg-cyan-100 text-cyan-700', PAGADA: 'bg-emerald-100 text-emerald-700' }

export function Liquidaciones() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'activas' | 'finalizadas'>('activas')
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  // Solo quien puede gestionar liquidaciones ve esta vista; el resto va a "Mis liquidaciones".
  if (!user?.permisos?.puedeGestionarLiquidaciones) return <Navigate to="/mis-liquidaciones" replace />

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-5">Liquidaciones</h1>

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
    </div>
  )
}

// ── Activas (saldo corriente) ────────────────────────────────────────────────

function ActivasTab({ notify }: { notify: (t: string, ok?: boolean) => void }) {
  const [resumen, setResumen] = useState<LiquidacionActivaResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<LiquidacionActivaDetalle | null>(null)
  const [corteDe, setCorteDe] = useState<LiquidacionActivaDetalle | null>(null) // finalizar directo desde la fila
  const [finalizandoFila, setFinalizandoFila] = useState(false)
  const [masivo, setMasivo] = useState(false)

  const cargar = () => { setCargando(true); liquidacionesService.activas().then(setResumen).catch(() => {}).finally(() => setCargando(false)) }
  useEffect(() => { cargar() }, [])

  const ver = async (doctorId: string) => {
    try { setDetalle(await liquidacionesService.activa(doctorId)) } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  const abrirCorte = async (doctorId: string) => {
    try { setCorteDe(await liquidacionesService.activa(doctorId)) } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  async function finalizarFila(fechaCorte: string) {
    if (!corteDe) return
    setFinalizandoFila(true)
    try { await liquidacionesService.finalizar(corteDe.doctor.id, fechaCorte); setCorteDe(null); notify('Liquidación finalizada'); cargar() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
    finally { setFinalizandoFila(false) }
  }

  const hayPagables = resumen.some((r) => r.aPagar > 0)

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setMasivo(true)} disabled={cargando || !hayPagables}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          Finalizar todas…
        </button>
      </div>

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
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => ver(r.doctorId)} className="text-cyan-600 hover:text-cyan-800 text-sm font-medium">Ver detalle →</button>
                  <button onClick={() => abrirCorte(r.doctorId)} disabled={r.aPagar <= 0}
                    className="ml-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">
                    Finalizar…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && <DetalleActivaModal detalle={detalle} onClose={() => setDetalle(null)} onFinalizado={() => { setDetalle(null); notify('Liquidación finalizada'); cargar() }} notify={notify} />}
      {corteDe && <FinalizarCorteModal detalle={corteDe} finalizando={finalizandoFila} onConfirmar={finalizarFila} onClose={() => setCorteDe(null)} />}
      {masivo && <FinalizarTodasModal resumen={resumen} onClose={() => setMasivo(false)} onFinalizado={() => { setMasivo(false); cargar() }} notify={notify} />}
    </>
  )
}

// Finalización masiva: pide UNA fecha de corte y cierra la liquidación de todos los
// profesionales con contrato activo; muestra el resultado (finalizadas y omitidas).
function FinalizarTodasModal({ resumen, onClose, onFinalizado, notify }: {
  resumen: LiquidacionActivaResumen[]; onClose: () => void; onFinalizado: () => void; notify: (t: string, ok?: boolean) => void
}) {
  const [fechaCorte, setFechaCorte] = useState(hoyYmd())
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<FinalizarTodasResultado | null>(null)
  const candidatos = resumen.filter((r) => r.aPagar > 0)

  async function ejecutar() {
    setEnviando(true)
    try { setResultado(await liquidacionesService.finalizarTodas(fechaCorte)) }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
    finally { setEnviando(false) }
  }

  if (resultado) {
    return (
      <Modal title="Liquidaciones finalizadas" onClose={onFinalizado}>
        <div className="space-y-1.5 mb-3">
          {resultado.finalizadas.map((f) => (
            <p key={f.doctorId} className="text-sm text-slate-700">✅ <b>{f.doctor}</b> · {f.acciones} acción(es) · <span className="font-mono text-cyan-700">{fmt(f.totalLiquidado)}</span></p>
          ))}
          {resultado.finalizadas.length === 0 && <p className="text-sm text-slate-500">No se finalizó ninguna liquidación.</p>}
          {resultado.omitidas.map((o) => (
            <p key={o.doctorId} className="text-xs text-slate-500">— {o.doctor}: sin acciones pagadas hasta el corte (queda para el próximo ciclo)</p>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <button onClick={onFinalizado} className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Listo</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Finalizar todas las liquidaciones" onClose={onClose}>
      <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de corte</label>
      <input type="date" value={fechaCorte} max={hoyYmd()} onChange={(e) => setFechaCorte(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-3" />
      <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 space-y-1 mb-3">
        <p>Se cierra la liquidación de <b className="text-slate-800">{candidatos.length}</b> profesional(es) con montos a pagar, con corte al {fmtFecha(fechaCorte + 'T12:00:00')}.</p>
        <p className="text-xs">Solo se cierran las acciones evolucionadas y pagadas hasta esa fecha. Lo evolucionado después, sin pagar o con pago parcial queda pendiente para el próximo ciclo.</p>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">Cancelar</button>
        <button onClick={ejecutar} disabled={enviando || candidatos.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          {enviando ? '…' : 'Finalizar todas'}
        </button>
      </div>
    </Modal>
  )
}

function explicacion(it: LiquidacionAccion, contrato: LiquidacionActivaDetalle['contrato']): string {
  // Monto fijo por prestación (override): se paga min(fijo, lo cobrado) − retención. Si lo
  // cobrado es menor al fijo, se otorga el máximo disponible (lo cobrado) − retención.
  if (it.origenCalculo === 'MONTO_FIJO_PRESTACION') {
    const fijo = it.montoFijoPrestacion ?? 0
    if (!it.pagada) return `Monto fijo por prestación (${fmt(fijo)}). Acción aún NO pagada → no suma a "A pagar". Potencial: ${fmt(it.total)}.`
    const tope = it.montoPagado < fijo
    return tope
      ? `Monto fijo por prestación: el fijo (${fmt(fijo)}) supera lo cobrado (${fmt(it.montoPagado)}). Se otorga el máximo disponible ${fmt(it.montoPagado)} − retención ${fmt(it.comision)} = ${fmt(it.total)}.`
      : `Monto fijo por prestación ${fmt(fijo)} − retención ${fmt(it.comision)} = ${fmt(it.total)}.`
  }
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

// YYYY-MM-DD de hoy en la zona del navegador (Chile).
const hoyYmd = () => new Date().toLocaleDateString('en-CA')
// Día (YYYY-MM-DD, zona local) en que se evolucionó una acción.
const diaLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA')

function DetalleActivaModal({ detalle, onClose, onFinalizado, notify }: {
  detalle: LiquidacionActivaDetalle; onClose: () => void; onFinalizado: () => void; notify: (t: string, ok?: boolean) => void
}) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [pidiendoCorte, setPidiendoCorte] = useState(false)
  const pagables = detalle.items.filter((i) => i.pagada).length

  async function finalizar(fechaCorte: string) {
    setFinalizando(true)
    try { await liquidacionesService.finalizar(detalle.doctor.id, fechaCorte); onFinalizado() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false); setPidiendoCorte(false) }
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
                  <td className="px-3 py-2 text-slate-700">
                    {it.accion}{it.pieza ? <span className="text-xs text-slate-400"> · {it.pieza}</span> : ''}
                    {it.origenCalculo === 'MONTO_FIJO_PRESTACION' && (
                      <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-semibold align-middle" title={`Monto fijo por prestación${it.montoFijoPrestacion != null ? `: ${fmt(it.montoFijoPrestacion)}` : ''}`}>Monto fijo</span>
                    )}
                  </td>
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
        <button onClick={() => setPidiendoCorte(true)} disabled={finalizando || pagables === 0}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          Finalizar liquidación…
        </button>
      </div>

      {pidiendoCorte && (
        <FinalizarCorteModal detalle={detalle} finalizando={finalizando}
          onConfirmar={finalizar} onClose={() => setPidiendoCorte(false)} />
      )}
    </Modal>
  )
}

// Pide la fecha de corte y muestra la foto de lo que se va a cerrar: solo acciones
// evolucionadas Y pagadas hasta esa fecha. Lo evolucionado impago o pagado parcial
// queda pendiente para el próximo ciclo.
function FinalizarCorteModal({ detalle, finalizando, onConfirmar, onClose }: {
  detalle: LiquidacionActivaDetalle; finalizando: boolean; onConfirmar: (fechaCorte: string) => void; onClose: () => void
}) {
  const [fechaCorte, setFechaCorte] = useState(hoyYmd())
  const enCorte = detalle.items.filter((i) => i.pagada && diaLocal(i.fecha) <= fechaCorte)
  const quedan = detalle.items.length - enCorte.length
  const total = enCorte.reduce((s, i) => s + i.total, 0)

  return (
    <Modal title="Finalizar liquidación" onClose={onClose}>
      <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de corte</label>
      <input type="date" value={fechaCorte} max={hoyYmd()} onChange={(e) => setFechaCorte(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-3" />

      <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 space-y-1 mb-3">
        <p>Se cierran <b className="text-slate-800">{enCorte.length}</b> acción(es) evolucionadas y pagadas hasta el {fmtFecha(fechaCorte + 'T12:00:00')} · total <b className="font-mono text-cyan-700">{fmt(total)}</b>.</p>
        {quedan > 0 && <p className="text-xs">{quedan} acción(es) quedan pendientes para el próximo ciclo (evolucionadas después del corte, sin pagar o con pago parcial).</p>}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">Cancelar</button>
        <button onClick={() => onConfirmar(fechaCorte)} disabled={finalizando || enCorte.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          {finalizando ? '…' : `Finalizar y pagar ${fmt(total)}`}
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

  // Agrupadas por mes de la fecha de corte (periodo YYYY-MM-DD), más recientes primero.
  const meses: [string, LiqFin[]][] = []
  for (const l of [...liqs].sort((a, b) => b.periodo.localeCompare(a.periodo))) {
    const mes = l.periodo.slice(0, 7)
    const grupo = meses.find(([m]) => m === mes)
    if (grupo) grupo[1].push(l)
    else meses.push([mes, [l]])
  }
  const nombreMes = (ym: string) => {
    const s = new Date(`${ym}-15T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <>
      {liqs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200"><p className="px-5 py-8 text-center text-slate-500 text-sm">Sin liquidaciones finalizadas.</p></div>
      ) : meses.map(([mes, grupo]) => (
        <div key={mes} className="mb-5">
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h3 className="text-sm font-semibold text-slate-700">{nombreMes(mes)}</h3>
            <span className="text-xs text-slate-400 font-mono">{grupo.length} liquidación(es) · {fmt(grupo.reduce((s, l) => s + l.totalLiquidado, 0))}</span>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {grupo.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <button onClick={async () => setDetalle(await liquidacionesService.obtener(l.id) as LiqFinDetalle)} className="text-left min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cyan-800">{l.doctor?.name ?? '—'} · corte {fmtFecha(l.periodo + 'T12:00:00')}</p>
                  <p className="text-xs text-slate-500">{l._count?.items ?? 0} acción(es) · pagado al profesional {fmt(l.totalLiquidado)}</p>
                </button>
                <select value={l.estado} onChange={(e) => cambiarEstado(l.id, e.target.value)}
                  className={`text-xs font-semibold rounded-lg px-2 py-1 border-0 ${ESTADO_COLOR[l.estado] ?? ''}`}>
                  {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
      {detalle && <DetalleFinalizadaModal liq={detalle} onClose={() => setDetalle(null)} />}
    </>
  )
}

function DetalleFinalizadaModal({ liq, onClose }: { liq: LiqFinDetalle; onClose: () => void }) {
  return (
    <Modal title={`${liq.doctor?.name ?? ''} · ${liq.periodo}`} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-4 text-sm mb-3 flex-wrap">
        <button onClick={() => window.open(`/print/liquidacion/${liq.id}`, '_blank')} className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-xs font-medium">Imprimir / PDF</button>
        <div className="flex gap-4">
          <span className="text-slate-500">Pagado por pacientes <b className="font-mono">{fmt(liq.totalBruto)}</b></span>
          <span className="text-slate-500 font-semibold">Pagado al profesional <b className="font-mono text-cyan-700">{fmt(liq.totalLiquidado)}</b></span>
        </div>
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
      <AdjuntosLiquidacion liqId={liq.id} />
    </Modal>
  )
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
