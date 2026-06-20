import { useCallback, useEffect, useState } from 'react'
import { cajasService, cobrosService } from '@/services/caja.service'
import { mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'
import { PacienteBuscador } from '@/components/PacienteBuscador'

interface Caja { id: string; nombre: string }
interface Sesion { id: string; estado: string; saldoApertura: number; abiertaAt: string; saldoEsperado?: number | null; saldoReal?: number | null; diferencia?: number | null; totalIngresos?: number | null; totalEgresos?: number | null }
interface Movimiento { id: string; tipo: string; monto: number; descripcion: string; categoria: string | null; fecha: string; anulado: boolean; user?: { name: string | null } | null; cobro?: { numero: number } | null }
interface Resumen { ingresos: number; egresos: number; saldoEsperado: number; saldoApertura: number }
interface Cobro { id: string; numero: number; concepto: string; monto: number; estado: string; anulado: boolean; fechaPago: string | null; paciente: { nombre: string; apellido: string }; medioPago?: { nombre: string } | null }

const fmt = (n: number | null | undefined) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n ?? 0))

export function Cobros() {
  const [cajas, setCajas] = useState<Caja[]>([])
  const [cajaId, setCajaId] = useState('')
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [estado, setEstado] = useState<'ABIERTA' | 'CERRADA' | 'SIN_SESION'>('SIN_SESION')
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [modal, setModal] = useState<null | 'abrir' | 'cerrar' | 'mov' | 'pago'>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  useEffect(() => {
    cajasService.listar().then((c) => { const cc = c as Caja[]; setCajas(cc); setCajaId((x) => x || cc[0]?.id || '') }).catch(() => {})
    cobrosService.listar().then((c) => setCobros((c as Cobro[]).slice(0, 20))).catch(() => {})
  }, [])

  const cargarCaja = useCallback(async () => {
    if (!cajaId) return
    const ses = await cajasService.sesiones(cajaId).catch(() => []) as Sesion[]
    const ultima = ses[0] ?? null
    if (!ultima) { setEstado('SIN_SESION'); setSesion(null); setMovimientos([]); setResumen(null); return }
    if (ultima.estado === 'ABIERTA') {
      setEstado('ABIERTA'); setSesion(ultima)
      const det = await cajasService.sesion(cajaId, ultima.id).catch(() => null) as { movimientos: Movimiento[]; resumen: Resumen } | null
      setMovimientos(det?.movimientos ?? []); setResumen(det?.resumen ?? null)
    } else {
      setEstado('CERRADA'); setSesion(ultima); setMovimientos([]); setResumen(null)
    }
  }, [cajaId])

  useEffect(() => { cargarCaja() }, [cargarCaja])
  const refrescarCobros = () => cobrosService.listar().then((c) => setCobros((c as Cobro[]).slice(0, 20))).catch(() => {})

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Cobros y caja</h1>
        <select value={cajaId} onChange={(e) => setCajaId(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          {cajas.length === 0 && <option>Sin cajas</option>}
        </select>
      </div>

      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {/* Estado de la caja */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
        {estado === 'ABIERTA' && sesion ? (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Caja abierta</span>
                <p className="text-xs text-slate-500 mt-1">Abierta el {new Date(sesion.abiertaAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModal('pago')} className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Recibir pago</button>
                <button onClick={() => setModal('mov')} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Movimiento</button>
                <button onClick={() => setModal('cerrar')} className="px-3.5 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-semibold rounded-xl">Cerrar caja</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Apertura" value={fmt(resumen?.saldoApertura ?? sesion.saldoApertura)} />
              <Stat label="Ingresos" value={fmt(resumen?.ingresos)} tone="emerald" />
              <Stat label="Egresos" value={fmt(resumen?.egresos)} tone="rose" />
              <Stat label="Saldo esperado" value={fmt(resumen?.saldoEsperado)} tone="cyan" />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${estado === 'CERRADA' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                {estado === 'CERRADA' ? 'Caja cerrada' : 'Caja sin abrir'}
              </span>
              {estado === 'CERRADA' && sesion?.saldoReal != null && (
                <p className="text-xs text-slate-500 mt-1">Último cierre: {fmt(sesion.saldoReal)} {sesion.diferencia ? `(dif. ${fmt(sesion.diferencia)})` : ''}</p>
              )}
            </div>
            <button onClick={() => setModal('abrir')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Abrir caja</button>
          </div>
        )}
      </div>

      {/* Movimientos de la sesión */}
      {estado === 'ABIERTA' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
          <p className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">Movimientos de hoy</p>
          {movimientos.length === 0 ? <p className="px-5 py-6 text-center text-slate-500 text-sm">Sin movimientos.</p> : (
            <div className="divide-y divide-slate-100">
              {movimientos.map((m) => (
                <div key={m.id} className={`flex items-center justify-between px-5 py-3 ${m.anulado ? 'opacity-40 line-through' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{m.descripcion}</p>
                    <p className="text-xs text-slate-500">{new Date(m.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}{m.user?.name ? ` · ${m.user.name}` : ''}</p>
                  </div>
                  <span className={`font-mono text-sm font-semibold ${m.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.tipo === 'INGRESO' ? '+' : '−'}{fmt(m.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cobros recientes */}
      <h2 className="text-sm font-semibold text-slate-700 mb-2">Cobros recientes</h2>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cobros.length === 0 ? <p className="px-5 py-6 text-center text-slate-500 text-sm">Sin cobros.</p> : cobros.map((c) => (
          <div key={c.id} className={`flex items-center justify-between px-5 py-3 ${c.anulado ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">#{c.numero} · {c.paciente.nombre} {c.paciente.apellido}</p>
              <p className="text-xs text-slate-500 truncate">{c.concepto}{c.medioPago ? ` · ${c.medioPago.nombre}` : ''}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-mono text-sm text-slate-700">{fmt(c.monto)}</span>
              {!c.anulado && c.estado !== 'ANULADO' && (
                <button onClick={async () => { const m = prompt('Motivo de la anulación (mín. 4):'); if (m && m.length >= 4) { try { await cobrosService.anular(c.id, m); notify('Cobro anulado'); refrescarCobros(); cargarCaja() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } } }}
                  className="text-xs text-rose-400 hover:text-rose-600">Anular</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal === 'abrir' && <AbrirModal cajaId={cajaId} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Caja abierta'); cargarCaja() }} onError={(m) => notify(m, false)} />}
      {modal === 'cerrar' && <CerrarModal cajaId={cajaId} resumen={resumen} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Caja cerrada'); cargarCaja() }} onError={(m) => notify(m, false)} />}
      {modal === 'mov' && <MovModal cajaId={cajaId} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Movimiento registrado'); cargarCaja() }} onError={(m) => notify(m, false)} />}
      {modal === 'pago' && <PagoModal cajaId={cajaId} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Pago registrado'); cargarCaja(); refrescarCobros() }} onError={(m) => notify(m, false)} />}
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: string }) {
  const c: Record<string, string> = { slate: 'text-slate-900', emerald: 'text-emerald-600', rose: 'text-rose-600', cyan: 'text-cyan-700' }
  return <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">{label}</p><p className={`text-lg font-bold font-mono ${c[tone]}`}>{value}</p></div>
}

function AbrirModal({ cajaId, onClose, onDone, onError }: { cajaId: string; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [saldo, setSaldo] = useState('')
  const [sugerido, setSugerido] = useState<number | null>(null)
  const [g, setG] = useState(false)
  useEffect(() => { cajasService.saldoSugerido(cajaId).then((r) => { setSugerido(r.saldoSugerido); setSaldo(String(r.saldoSugerido)) }).catch(() => {}) }, [cajaId])
  async function abrir() { setG(true); try { await cajasService.abrir(cajaId, Number(saldo)); onDone() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) } }
  return (
    <Modal title="Abrir caja" onClose={onClose}>
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Conteo inicial declarado</span>
        <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="numeric" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {sugerido != null && <p className="text-xs text-slate-500 mt-1">Sugerido: {fmt(sugerido)}</p>}
      </label>
      <Acciones onClose={onClose} onOk={abrir} okLabel="Abrir" loading={g} />
    </Modal>
  )
}

function CerrarModal({ cajaId, resumen, onClose, onDone, onError }: { cajaId: string; resumen: Resumen | null; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [saldo, setSaldo] = useState('')
  const [obs, setObs] = useState('')
  const [g, setG] = useState(false)
  const dif = resumen && saldo !== '' ? Number(saldo) - resumen.saldoEsperado : null
  async function cerrar() { setG(true); try { await cajasService.cerrar(cajaId, Number(saldo), obs || undefined); onDone() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) } }
  return (
    <Modal title="Cerrar caja" onClose={onClose}>
      {resumen && <p className="text-sm text-slate-600 mb-3">Saldo esperado: <span className="font-mono font-semibold">{fmt(resumen.saldoEsperado)}</span></p>}
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

function MovModal({ cajaId, onClose, onDone, onError }: { cajaId: string; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [tipo, setTipo] = useState<'EGRESO' | 'INGRESO'>('EGRESO')
  const [monto, setMonto] = useState('')
  const [desc, setDesc] = useState('')
  const [g, setG] = useState(false)
  async function guardar() { setG(true); try { await cajasService.crearMovimiento(cajaId, { tipo, monto: Number(monto), descripcion: desc }); onDone() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) } }
  return (
    <Modal title="Movimiento de caja" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {(['EGRESO', 'INGRESO'] as const).map((t) => (
          <button key={t} onClick={() => setTipo(t)} className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border-2 ${tipo === t ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'}`}>{t === 'EGRESO' ? 'Egreso' : 'Ingreso'}</button>
        ))}
      </div>
      <input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto" inputMode="numeric" className="w-full mb-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      <Acciones onClose={onClose} onOk={guardar} okLabel="Registrar" loading={g} />
    </Modal>
  )
}

function PagoModal({ cajaId, onClose, onDone, onError }: { cajaId: string; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [medios, setMedios] = useState<MedioPagoDTO[]>([])
  const [pacienteId, setPacienteId] = useState('')
  const [medioPagoId, setMedioPagoId] = useState('')
  const [items, setItems] = useState([{ descripcion: '', monto: '' }])
  const [g, setG] = useState(false)
  useEffect(() => { mediosPagoService.listar().then(setMedios).catch(() => {}) }, [])
  const total = items.reduce((s, i) => s + (Number(i.monto) || 0), 0)
  const puede = pacienteId && items.some((i) => i.descripcion && Number(i.monto) > 0)
  async function guardar() {
    setG(true)
    try {
      await cobrosService.crear({ pacienteId, cajaId, medioPagoId: medioPagoId || undefined, items: items.filter((i) => i.descripcion && Number(i.monto) > 0).map((i) => ({ descripcion: i.descripcion, monto: Number(i.monto) })) })
      onDone()
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) }
  }
  return (
    <Modal title="Recibir pago" onClose={onClose}>
      <div className="mb-3">
        <PacienteBuscador onSelect={(p) => setPacienteId(p?.id ?? '')} placeholder="Buscar paciente…" />
      </div>
      <div className="space-y-2 mb-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input value={it.descripcion} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} placeholder="Concepto" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            <input value={it.monto} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))} placeholder="Monto" inputMode="numeric" className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
          </div>
        ))}
        <button onClick={() => setItems([...items, { descripcion: '', monto: '' }])} className="text-xs text-cyan-600 font-medium">+ Agregar ítem</button>
      </div>
      <select value={medioPagoId} onChange={(e) => setMedioPagoId(e.target.value)} className="w-full mb-3 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
        <option value="">Medio de pago…</option>
        {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.comision ? ` (${m.comision}%)` : ''}</option>)}
      </select>
      <p className="text-right text-sm font-semibold text-slate-800 mb-1">Total: {fmt(total)}</p>
      <Acciones onClose={onClose} onOk={guardar} okLabel="Cobrar" loading={g} disabled={!puede} />
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
