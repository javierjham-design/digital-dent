import { useEffect, useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { crmService, type Lead, type CrmResumen, type CrmConfig } from '@/services/crm.service'
import { usuariosService } from '@/services/equipo.service'
import type { DoctorDTO } from '@shared/types'
import { ApiError } from '@/services/api'

const MOTIVOS = ['Consulta diagnóstico', 'Control', 'Detartraje / Profilaxis', 'Obturación', 'Endodoncia', 'Exodoncia', 'Ortodoncia', 'Blanqueamiento', 'Implantes', 'Urgencia', 'Otro']
const DURACIONES = [15, 30, 45, 60, 90, 120]

const ESTADOS = [
  { k: 'NUEVO', l: 'Nuevo', c: 'bg-sky-100 text-sky-700' },
  { k: 'CONTACTADO', l: 'Contactado', c: 'bg-amber-100 text-amber-700' },
  { k: 'AGENDADO', l: 'Agendado', c: 'bg-cyan-100 text-cyan-700' },
  { k: 'CONVERTIDO', l: 'Convertido', c: 'bg-emerald-100 text-emerald-700' },
  { k: 'PERDIDO', l: 'Perdido', c: 'bg-slate-200 text-slate-500' },
]
const estadoCfg = (k: string) => ESTADOS.find((e) => e.k === k) ?? { k, l: k, c: 'bg-slate-100 text-slate-600' }
const fecha = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

// Click-ids por plataforma para mostrar en el detalle (campo → etiqueta).
const CLICK_LABELS: { k: keyof Lead; l: string }[] = [
  { k: 'fbclid', l: 'fbclid (Meta)' }, { k: 'ctwaClid', l: 'ctwa_clid (WhatsApp Ads)' },
  { k: 'gclid', l: 'gclid (Google)' }, { k: 'msclkid', l: 'msclkid (Microsoft)' },
  { k: 'ttclid', l: 'ttclid (TikTok)' }, { k: 'twclid', l: 'twclid (X)' },
  { k: 'liFatId', l: 'li_fat_id (LinkedIn)' }, { k: 'igclid', l: 'igclid (Instagram)' },
  { k: 'dclid', l: 'dclid (Display)' },
]
// Señales de identidad que Meta usa para el Event Match Quality.
function emqSignals(l: Lead): number {
  return [l.email, l.telefono, l.nombre, l.apellido, l.externalId, l.fbp, l.fbc].filter(Boolean).length
}
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export function Crm() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [resumen, setResumen] = useState<CrmResumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<string>('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Lead | null>(null)
  const [modal, setModal] = useState<null | 'nuevo' | 'config'>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargar = () => {
    crmService.leads({ estado: estado || undefined, q: q.trim().length >= 2 ? q.trim() : undefined }).then(setLeads).catch(() => {}).finally(() => setCargando(false))
    crmService.resumen().then(setResumen).catch(() => {})
  }
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t) }, [estado, q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">CRM · Leads</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal('config')} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Configuración / Formulario</button>
          <button onClick={() => setModal('nuevo')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nuevo lead</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-5">Prospectos captados por formularios web, campañas de Meta y reservas online. Gestiona el seguimiento y conviértelos en pacientes.</p>

      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {/* Embudo */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-5">
        <FunnelCard label="Total" v={resumen?.total ?? 0} activo={estado === ''} onClick={() => setEstado('')} />
        {ESTADOS.map((e) => (
          <FunnelCard key={e.k} label={e.l} v={resumen?.estados[e.k] ?? 0} activo={estado === e.k} onClick={() => setEstado(estado === e.k ? '' : e.k)} tone={e.c} />
        ))}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono, email o campaña…"
        className="w-full max-w-md mb-4 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? <p className="px-5 py-10 text-center text-slate-500 text-sm">Cargando…</p>
          : leads.length === 0 ? <p className="px-5 py-10 text-center text-slate-500 text-sm">Sin leads {estado ? 'en este estado' : 'todavía'}. Comparte tu formulario o conecta tus campañas.</p>
          : leads.map((l) => {
            const ec = estadoCfg(l.estado)
            return (
              <button key={l.id} onClick={() => setSel(l)} className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{l.nombre} {l.apellido ?? ''}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {l.telefono ?? l.email ?? '—'} · {l.origen}{l.campana ? ` · ${l.campana}` : ''} · {fecha(l.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${ec.c}`}>{ec.l}</span>
              </button>
            )
          })}
      </div>

      {sel && <LeadDetalle lead={sel} onClose={() => setSel(null)} onChanged={() => { setSel(null); cargar() }} notify={notify} />}
      {modal === 'nuevo' && <NuevoLeadModal onClose={() => setModal(null)} onCreated={() => { setModal(null); notify('Lead creado'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal === 'config' && <ConfigModal onClose={() => setModal(null)} notify={notify} />}
    </div>
  )
}

function FunnelCard({ label, v, activo, onClick, tone }: { label: string; v: number; activo: boolean; onClick: () => void; tone?: string }) {
  return (
    <button onClick={onClick} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${activo ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone ? tone.replace(/bg-\S+/, '').trim() : 'text-slate-400'}`}>{label}</p>
      <p className="text-2xl font-bold text-slate-900">{v}</p>
    </button>
  )
}

function LeadDetalle({ lead, onClose, onChanged, notify }: { lead: Lead; onClose: () => void; onChanged: () => void; notify: (t: string, ok?: boolean) => void }) {
  const navigate = useNavigate()
  const [full, setFull] = useState<Lead>(lead)
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [agendando, setAgendando] = useState(false)
  const [verTracking, setVerTracking] = useState(false)
  const [ed, setEd] = useState({ tratamiento: '', piezasReemplazar: '', tiempoDesdePerdida: '', fechaAgenda: '' })
  const refrescar = () => crmService.lead(lead.id).then((l) => { setFull(l); setEd({ tratamiento: l.tratamiento ?? '', piezasReemplazar: l.piezasReemplazar ?? '', tiempoDesdePerdida: l.tiempoDesdePerdida ?? '', fechaAgenda: toLocalInput(l.fechaAgenda) }) }).catch(() => {})
  useEffect(() => { refrescar() }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cambiarEstado(e: string) {
    try { await crmService.actualizar(lead.id, { estado: e }); refrescar(); notify('Estado actualizado') } catch (err) { notify(err instanceof ApiError ? err.message : 'Error', false) }
  }
  async function guardarDatos() {
    try {
      await crmService.actualizar(lead.id, {
        tratamiento: ed.tratamiento.trim() || null, piezasReemplazar: ed.piezasReemplazar.trim() || null,
        tiempoDesdePerdida: ed.tiempoDesdePerdida.trim() || null, fechaAgenda: ed.fechaAgenda ? new Date(ed.fechaAgenda).toISOString() : null,
      })
      refrescar(); notify('Datos guardados')
    } catch (err) { notify(err instanceof ApiError ? err.message : 'Error', false) }
  }
  async function marcarAsistio(v: boolean | null) {
    try { await crmService.actualizar(lead.id, { asistio: v }); refrescar() } catch (err) { notify(err instanceof ApiError ? err.message : 'Error', false) }
  }
  async function agregarNota() {
    if (!nota.trim()) return
    try { await crmService.nota(lead.id, nota.trim()); setNota(''); refrescar() } catch (err) { notify(err instanceof ApiError ? err.message : 'Error', false) }
  }
  async function convertir() {
    setBusy(true)
    try { const r = await crmService.convertir(lead.id); notify(r.yaExistia ? 'Ya estaba vinculado a un paciente' : 'Convertido en paciente'); navigate(`/pacientes/${r.pacienteId}`) }
    catch (err) { notify(err instanceof ApiError ? err.message : 'Error', false) } finally { setBusy(false) }
  }
  async function eliminar() {
    if (!confirm('¿Eliminar este lead?')) return
    try { await crmService.eliminar(lead.id); onChanged() } catch (err) { notify(err instanceof ApiError ? err.message : 'Error', false) }
  }

  const emq = emqSignals(full)
  const emqTone = emq >= 6 ? 'text-emerald-600' : emq >= 4 ? 'text-amber-600' : 'text-rose-500'
  const clicksPresentes = CLICK_LABELS.filter((c) => full[c.k])

  return (
    <Modal title={`${full.nombre} ${full.apellido ?? ''}`} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ESTADOS.map((e) => (
          <button key={e.k} onClick={() => cambiarEstado(e.k)} disabled={full.estado === e.k}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border-2 disabled:opacity-100 ${full.estado === e.k ? `${e.c} border-transparent` : 'border-slate-200 text-slate-500'}`}>{e.l}</button>
        ))}
      </div>
      <dl className="text-sm space-y-1 mb-3">
        <Row k="Teléfono" v={full.telefono ?? '—'} />
        <Row k="Email" v={full.email ?? '—'} />
        <Row k="RUT" v={full.rut ?? '—'} />
        <Row k="Motivo" v={full.motivo ?? '—'} />
        <Row k="Origen" v={full.origen} />
        {full.campana && <Row k="Campaña" v={full.campana} />}
        {full.utmCampaign && <Row k="UTM campaign" v={full.utmCampaign} />}
        {full.utmSource && <Row k="UTM source" v={`${full.utmSource}${full.utmMedium ? ` / ${full.utmMedium}` : ''}`} />}
        {full.fechaAgenda && <Row k="Hora agendada" v={fecha(full.fechaAgenda)} />}
        {full.agendaFuente && <Row k="Agenda vía" v={full.agendaFuente} />}
        <Row k="Recibido" v={fecha(full.createdAt)} />
      </dl>

      {/* Datos de la campaña dental (editables) + asistencia */}
      <div className="border-t border-slate-100 pt-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Datos de seguimiento</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={ed.tratamiento} onChange={(e) => setEd((s) => ({ ...s, tratamiento: e.target.value }))} placeholder="Tratamiento de interés" className={inp} />
          <input value={ed.piezasReemplazar} onChange={(e) => setEd((s) => ({ ...s, piezasReemplazar: e.target.value }))} placeholder="Piezas a reemplazar" className={inp} />
          <input value={ed.tiempoDesdePerdida} onChange={(e) => setEd((s) => ({ ...s, tiempoDesdePerdida: e.target.value }))} placeholder="Tiempo desde pérdida" className={inp} />
          <input type="datetime-local" value={ed.fechaAgenda} onChange={(e) => setEd((s) => ({ ...s, fechaAgenda: e.target.value }))} className={inp} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">¿Asistió?</span>
            {([['Sí', true], ['No', false], ['—', null]] as const).map(([l, v]) => (
              <button key={l} onClick={() => marcarAsistio(v)} className={`text-xs font-semibold px-2 py-1 rounded-lg border ${full.asistio === v ? 'border-cyan-400 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-500'}`}>{l}</button>
            ))}
          </div>
          <button onClick={guardarDatos} className="text-xs font-semibold px-3 py-1.5 bg-slate-900 text-white rounded-lg">Guardar datos</button>
        </div>
      </div>

      {/* Calidad de datos para Meta + estado de envío */}
      <div className="border-t border-slate-100 pt-3 mb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meta</p>
          <span className={`text-xs font-semibold ${emqTone}`}>Señales de match: {emq}/7</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded-full ${full.metaEnviado ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>Lead {full.metaEnviado ? 'enviado' : 'no enviado'}</span>
          {(full.origen === 'AGENDA_ONLINE' || full.scheduleEventId) && (
            <span className={`px-2 py-0.5 rounded-full ${full.scheduleCapiEnviado ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>Schedule {full.scheduleCapiEnviado ? 'enviado' : 'no enviado'}</span>
          )}
          {full.externalId && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">external_id ✓</span>}
          {full.fbp && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">_fbp ✓</span>}
          {full.fbc && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">_fbc ✓</span>}
        </div>
      </div>

      {/* Tracking completo (colapsable) */}
      <div className="border-t border-slate-100 pt-3 mb-3">
        <button onClick={() => setVerTracking((v) => !v)} className="text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
          {verTracking ? '▾' : '▸'} Tracking y atribución {clicksPresentes.length > 0 ? `· ${clicksPresentes.length} click-id${clicksPresentes.length > 1 ? 's' : ''}` : ''}
        </button>
        {verTracking && (
          <dl className="text-sm space-y-1 mt-2">
            {full.externalId && <Row k="External ID" v={full.externalId} />}
            {full.utmMedium && <Row k="UTM medium" v={full.utmMedium} />}
            {full.utmContent && <Row k="UTM content" v={full.utmContent} />}
            {full.utmTerm && <Row k="UTM term" v={full.utmTerm} />}
            {clicksPresentes.map((c) => <Row key={c.k} k={c.l} v={String(full[c.k])} />)}
            {full.landing && <Row k="Landing" v={full.landing} />}
            {full.referrer && <Row k="Referrer" v={full.referrer} />}
            {full.tituloPagina && <Row k="Título página" v={full.tituloPagina} />}
            {full.pantalla && <Row k="Pantalla" v={full.pantalla} />}
            {full.locale && <Row k="Idioma" v={full.locale} />}
            {full.primeraVisita && <Row k="Primera visita" v={fecha(full.primeraVisita)} />}
            {full.ultimaVisita && <Row k="Última visita" v={fecha(full.ultimaVisita)} />}
            {clicksPresentes.length === 0 && !full.externalId && <p className="text-xs text-slate-400">Sin datos de atribución.</p>}
          </dl>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setAgendando(true)} className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Agendar hora</button>
        {full.pacienteId
          ? <button onClick={() => navigate(`/pacientes/${full.pacienteId}`)} className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-xl">Ver ficha</button>
          : <button onClick={convertir} disabled={busy} className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-sm font-medium rounded-xl">Solo crear paciente</button>}
        <button onClick={eliminar} className="px-3 py-2 border border-slate-200 text-slate-400 hover:text-rose-600 text-sm rounded-xl">Eliminar</button>
      </div>
      {agendando && <AgendarLeadModal lead={full} navigate={navigate} notify={notify} onClose={() => setAgendando(false)} onDone={() => { setAgendando(false); refrescar() }} />}

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Notas</p>
        <div className="flex gap-2 mb-3">
          <input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarNota() }} placeholder="Agregar nota…" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <button onClick={agregarNota} className="px-3 py-2 bg-slate-900 text-white text-sm rounded-lg">Nota</button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {(full.notas ?? []).map((n) => (
            <div key={n.id} className="text-sm">
              <p className="text-slate-700">{n.texto}</p>
              <p className="text-[11px] text-slate-400">{n.autorNombre ?? 'Sistema'} · {fecha(n.createdAt)}</p>
            </div>
          ))}
          {(full.notas ?? []).length === 0 && <p className="text-xs text-slate-400">Sin notas aún.</p>}
        </div>
      </div>
    </Modal>
  )
}

function AgendarLeadModal({ lead, navigate, notify, onClose, onDone }: {
  lead: Lead; navigate: NavigateFunction; notify: (t: string, ok?: boolean) => void; onClose: () => void; onDone: () => void
}) {
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [fechaLocal, setFechaLocal] = useState('')
  const [duracion, setDuracion] = useState(30)
  const [tipo, setTipo] = useState(lead.tratamiento || '')
  const [notas, setNotas] = useState(lead.motivo || '')
  const [sobrecupo, setSobrecupo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ pacienteId: string; inicio: string } | null>(null)

  useEffect(() => { usuariosService.doctores().then((d) => { setDoctores(d); setDoctorId((prev) => prev || d[0]?.id || '') }).catch(() => {}) }, [])
  useEffect(() => {
    if (lead.fechaAgenda) { setFechaLocal(toLocalInput(lead.fechaAgenda)); return }
    const d = new Date(); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0)
    setFechaLocal(toLocalInput(d.toISOString()))
  }, [lead.fechaAgenda])

  async function agendar() {
    if (!doctorId || !fechaLocal) { notify('Selecciona profesional, fecha y hora', false); return }
    setBusy(true)
    try {
      const r = await crmService.agendar(lead.id, {
        doctorId, fecha: new Date(fechaLocal).toISOString(), duracion,
        tipo: tipo || undefined, notas: notas.trim() || undefined, sobrecupo,
      })
      setRes({ pacienteId: r.pacienteId, inicio: r.inicio })
      notify('Hora agendada')
    } catch (e) { notify(e instanceof ApiError ? e.message : 'No se pudo agendar', false) } finally { setBusy(false) }
  }

  if (res) {
    const cuando = new Date(res.inicio).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
    return (
      <Modal title="Hora agendada" onClose={onDone}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-3">✓</div>
          <p className="text-sm text-slate-700">Cita creada para <span className="font-semibold">{lead.nombre} {lead.apellido ?? ''}</span></p>
          <p className="text-sm text-slate-500 mt-1 capitalize">{cuando}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-4">
          <button onClick={() => navigate('/agenda')} className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Ir a la agenda</button>
          <button onClick={() => navigate(`/pacientes/${res.pacienteId}`)} className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">Ver ficha</button>
        </div>
        <button onClick={onDone} className="w-full mt-2 px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cerrar</button>
      </Modal>
    )
  }

  return (
    <Modal title={`Agendar hora · ${lead.nombre} ${lead.apellido ?? ''}`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Se creará (o reutilizará) el paciente con los datos del lead y quedará la cita en la agenda.</p>
      <div className="space-y-3">
        <label className="block"><span className="text-xs font-medium text-slate-500">Profesional</span>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inp}>
            <option value="">Selecciona…</option>
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-xs font-medium text-slate-500">Fecha y hora</span>
          <input type="datetime-local" value={fechaLocal} onChange={(e) => setFechaLocal(e.target.value)} className={inp} />
        </label>
        <div>
          <span className="block text-xs font-medium text-slate-500 mb-1">Duración</span>
          <div className="flex gap-2 flex-wrap">
            {DURACIONES.map((d) => (
              <button key={d} type="button" onClick={() => setDuracion(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 ${duracion === d ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600'}`}>{d}m</button>
            ))}
          </div>
        </div>
        <label className="block"><span className="text-xs font-medium text-slate-500">Motivo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inp}>
            <option value="">Consulta</option>
            {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas de la cita" className={inp} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={sobrecupo} onChange={(e) => setSobrecupo(e.target.checked)} /> Sobrecupo (permite solaparse)
        </label>
      </div>
      <div className="flex gap-2 pt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={agendar} disabled={busy} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Agendando…' : 'Agendar cita'}</button>
      </div>
    </Modal>
  )
}

function NuevoLeadModal({ onClose, onCreated, onError }: { onClose: () => void; onCreated: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ nombre: '', apellido: '', telefono: '', email: '', motivo: '', tratamiento: '', campana: '' })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  async function crear() {
    if (!f.nombre.trim()) { onError('Falta el nombre'); return }
    setBusy(true)
    try { await crmService.crear({ ...f, origen: 'MANUAL' }); onCreated() } catch (e) { onError(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  return (
    <Modal title="Nuevo lead" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Nombre *" className={inp} />
        <input value={f.apellido} onChange={(e) => set({ apellido: e.target.value })} placeholder="Apellido" className={inp} />
        <input value={f.telefono} onChange={(e) => set({ telefono: e.target.value })} placeholder="Teléfono" className={inp} />
        <input value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email" className={inp} />
        <input value={f.tratamiento} onChange={(e) => set({ tratamiento: e.target.value })} placeholder="Tratamiento de interés" className={inp} />
        <input value={f.motivo} onChange={(e) => set({ motivo: e.target.value })} placeholder="Motivo / interés" className={inp} />
        <input value={f.campana} onChange={(e) => set({ campana: e.target.value })} placeholder="Campaña" className={`${inp} col-span-2`} />
      </div>
      <div className="flex gap-2 pt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={crear} disabled={busy} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Guardando…' : 'Crear lead'}</button>
      </div>
    </Modal>
  )
}

function ConfigModal({ onClose, notify }: { onClose: () => void; notify: (t: string, ok?: boolean) => void }) {
  const [cfg, setCfg] = useState<CrmConfig | null>(null)
  const [pixel, setPixel] = useState('')
  const [token, setToken] = useState('')
  const [test, setTest] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { crmService.config().then((c) => { setCfg(c); setPixel(c.metaPixelId ?? ''); setTest(c.metaTestCode ?? ''); setEnabled(c.metaEnabled) }).catch(() => {}) }, [])

  const formUrl = cfg ? `${window.location.origin}/c/${cfg.slug}/formulario/${cfg.crmToken}` : ''
  const intakeUrl = cfg ? `${window.location.origin.replace(/^http/, 'http')}/api/v1/public/crm/${cfg.slug}/${cfg.crmToken}/lead` : ''

  async function guardar() {
    setBusy(true)
    try {
      const payload: Record<string, unknown> = { metaEnabled: enabled, metaPixelId: pixel.trim() || null, metaTestCode: test.trim() || null }
      if (token.trim()) payload.metaCapiToken = token.trim()
      const c = await crmService.guardarConfig(payload); setCfg(c); setToken(''); notify('Configuración guardada')
    } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } finally { setBusy(false) }
  }
  const copiar = (t: string) => { navigator.clipboard.writeText(t).then(() => notify('Copiado')).catch(() => {}) }

  return (
    <Modal title="Configuración del CRM" onClose={onClose}>
      {!cfg ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Captación web</p>
            <p className="text-xs text-slate-500 mb-2">Formulario hospedado (compartilo o insértalo con un iframe):</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-2">
              <span className="text-xs font-mono text-slate-500 truncate flex-1">{formUrl}</span>
              <button onClick={() => copiar(formUrl)} className="text-xs font-semibold text-cyan-700 shrink-0">Copiar</button>
              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 shrink-0">Abrir</a>
            </div>
            <p className="text-xs text-slate-500 mb-1">Endpoint de intake (para tu formulario web / App Script → POST JSON):</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-xs font-mono text-slate-500 truncate flex-1">{intakeUrl}</span>
              <button onClick={() => copiar(intakeUrl)} className="text-xs font-semibold text-cyan-700 shrink-0">Copiar</button>
            </div>
            <details className="mt-2">
              <summary className="text-xs font-semibold text-slate-500 cursor-pointer">Campos que acepta (JSON)</summary>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed font-mono break-words">
                nombre*, apellido, telefono, email, rut, motivo, tratamiento, piezasReemplazar, tiempoDesdePerdida,
                externalId, campana, utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
                fbclid, ctwaClid, gclid, msclkid, ttclid, twclid, liFatId, igclid, dclid, fbp, fbc,
                referrer, landing, tituloPagina, pantalla, locale, primeraVisita, ultimaVisita, eventId
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Manda los mismos nombres de tu planilla mapeados a estos. Cuantos más identificadores (email, teléfono, external_id, _fbp/_fbc), mejor el match quality de Meta.</p>
            </details>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enviar eventos a Meta (Pixel + Conversions API)
            </label>
            <label className="block mb-2"><span className="text-xs font-medium text-slate-500">Pixel ID</span>
              <input value={pixel} onChange={(e) => setPixel(e.target.value)} placeholder="123456789012345" className={`${inp} font-mono`} /></label>
            <label className="block mb-2"><span className="text-xs font-medium text-slate-500">Conversions API — Access Token {cfg.hasCapiToken ? '(configurado, dejar vacío para mantener)' : ''}</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.hasCapiToken ? '••••••••' : 'Pegar token'} className={`${inp} font-mono`} /></label>
            <label className="block"><span className="text-xs font-medium text-slate-500">Test Event Code (opcional, para probar)</span>
              <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="TEST12345" className={`${inp} font-mono`} /></label>
            <p className="text-[11px] text-slate-400 mt-2">El Pixel se inyecta en el formulario y las páginas de reserva. Los eventos server-side (Lead, Schedule) se deduplican con el Pixel por event_id.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
            <button onClick={guardar} disabled={busy} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

const inp = 'w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
function Row({ k, v }: { k: string; v: string }) { return <div className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right truncate">{v}</dd></div> }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        {children}
      </div>
    </div>
  )
}
