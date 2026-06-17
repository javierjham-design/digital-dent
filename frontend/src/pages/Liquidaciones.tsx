import { useEffect, useState } from 'react'
import type { DoctorDTO } from '@shared/types'
import { liquidacionesService, contratosService } from '@/services/caja.service'
import { usuariosService } from '@/services/equipo.service'
import { ApiError } from '@/services/api'

interface Liq { id: string; periodo: string; totalBruto: number; totalLiquidado: number; estado: string; doctor?: { name: string | null; especialidad: string | null }; _count?: { items: number } }
interface LiqItem { id: string; prestacionNombre: string; pacienteNombre: string; diente: string | null; montoLiquidado: number }
interface LiqDetalle extends Liq { items: LiqItem[] }
interface Contrato { id: string; tipo: string; porcentaje: number | null; montoFijo: number | null; activo: boolean; doctor?: { name: string | null } }

const fmt = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n))
const ESTADOS = ['BORRADOR', 'APROBADA', 'PAGADA']
const ESTADO_COLOR: Record<string, string> = { BORRADOR: 'bg-slate-200 text-slate-600', APROBADA: 'bg-cyan-100 text-cyan-700', PAGADA: 'bg-emerald-100 text-emerald-700' }

export function Liquidaciones() {
  const [liqs, setLiqs] = useState<Liq[]>([])
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [detalle, setDetalle] = useState<LiqDetalle | null>(null)
  const [modal, setModal] = useState<null | 'generar' | 'contratos'>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargar = () => liquidacionesService.listar().then((l) => setLiqs(l as Liq[])).catch(() => {})
  useEffect(() => { cargar(); usuariosService.doctores().then(setDoctores).catch(() => {}) }, [])

  async function cambiarEstado(id: string, estado: string) {
    try { await liquidacionesService.actualizar(id, { estado }); notify('Estado actualizado'); cargar(); if (detalle?.id === id) setDetalle({ ...detalle, estado }) }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Liquidaciones</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal('contratos')} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Contratos</button>
          <button onClick={() => setModal('generar')} className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Generar</button>
        </div>
      </div>

      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {liqs.length === 0 ? <p className="px-5 py-8 text-center text-slate-500 text-sm">Sin liquidaciones.</p> : liqs.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
            <button onClick={async () => setDetalle(await liquidacionesService.obtener(l.id) as LiqDetalle)} className="text-left min-w-0 flex-1">
              <p className="text-sm font-semibold text-cyan-800">{l.doctor?.name ?? '—'} · {l.periodo}</p>
              <p className="text-xs text-slate-500">{l._count?.items ?? 0} tratamientos · liquidado {fmt(l.totalLiquidado)}</p>
            </button>
            <select value={l.estado} onChange={(e) => cambiarEstado(l.id, e.target.value)}
              className={`text-xs font-semibold rounded-lg px-2 py-1 border-0 ${ESTADO_COLOR[l.estado] ?? ''}`}>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
      </div>

      {modal === 'generar' && <GenerarModal doctores={doctores} onClose={() => setModal(null)} onDone={() => { setModal(null); notify('Liquidación generada'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal === 'contratos' && <ContratosModal doctores={doctores} onClose={() => setModal(null)} notify={notify} />}
      {detalle && <DetalleModal liq={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}

function GenerarModal({ doctores, onClose, onDone, onError }: { doctores: DoctorDTO[]; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [doctorId, setDoctorId] = useState(doctores[0]?.id ?? '')
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7))
  const [g, setG] = useState(false)
  async function generar() { setG(true); try { await liquidacionesService.crear({ doctorId, periodo }); onDone() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setG(false) } }
  return (
    <Modal title="Generar liquidación" onClose={onClose}>
      <label className="block mb-3"><span className="block text-sm font-medium text-slate-700 mb-1">Profesional</span>
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
          {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
        </select></label>
      <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Período</span>
        <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" /></label>
      <p className="text-xs text-slate-500 mt-2">Toma los tratamientos completados en el período según el contrato activo del profesional.</p>
      <div className="flex gap-2 pt-5">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">Cancelar</button>
        <button onClick={generar} disabled={g || !doctorId} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? '…' : 'Generar'}</button>
      </div>
    </Modal>
  )
}

function DetalleModal({ liq, onClose }: { liq: LiqDetalle; onClose: () => void }) {
  return (
    <Modal title={`${liq.doctor?.name ?? ''} · ${liq.periodo}`} onClose={onClose}>
      <div className="flex justify-between text-sm mb-3">
        <span className="text-slate-500">Total bruto</span><span className="font-mono">{fmt(liq.totalBruto)}</span>
      </div>
      <div className="flex justify-between text-sm mb-4">
        <span className="text-slate-500 font-semibold">Total liquidado</span><span className="font-mono font-bold text-cyan-700">{fmt(liq.totalLiquidado)}</span>
      </div>
      <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {liq.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="min-w-0"><p className="truncate text-slate-800">{it.prestacionNombre}</p><p className="text-xs text-slate-500 truncate">{it.pacienteNombre}{it.diente ? ` · ${it.diente}` : ''}</p></div>
            <span className="font-mono text-slate-700">{fmt(it.montoLiquidado)}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

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
