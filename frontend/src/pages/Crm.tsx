import { useEffect, useState } from 'react'
import { Link, useNavigate, type NavigateFunction } from 'react-router-dom'
import { crmService, type Lead, type CrmResumen, type CrmConfig, type CampanaItem, type IngresoEntry } from '@/services/crm.service'
import { usuariosService } from '@/services/equipo.service'
import { clinicaService } from '@/services/catalogo.service'
import type { DoctorDTO } from '@shared/types'
import { useAuth } from '@/hooks/useAuth'
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
function parseIngresos(raw?: string | null): IngresoEntry[] {
  if (!raw) return []
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Origen de captación (de dónde vino el lead) → etiqueta + color.
const ORIGENES: Record<string, { l: string; c: string }> = {
  META: { l: 'Meta Ads', c: 'bg-violet-100 text-violet-700' },
  INSTAGRAM: { l: 'Instagram', c: 'bg-pink-100 text-pink-700' },
  FORMULARIO: { l: 'Formulario', c: 'bg-sky-100 text-sky-700' },
  AGENDA_ONLINE: { l: 'Link online', c: 'bg-cyan-100 text-cyan-700' },
  MANUAL: { l: 'Manual', c: 'bg-slate-100 text-slate-600' },
  OTRO: { l: 'Otro', c: 'bg-slate-100 text-slate-600' },
}
const origenCfg = (o: string) => ORIGENES[o] ?? { l: o, c: 'bg-slate-100 text-slate-600' }
const chip = 'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full'
// "Agendó por el link online" = tiene fuente de agenda y NO fue agendado desde el CRM/recepción.
const agendoOnline = (l: Lead) => Boolean(l.agendaFuente && l.agendaFuente !== 'CRM')
// Nombre visible de campaña de un lead (etiqueta renombrada del backend, o campaña cruda).
const campanaDe = (l: Lead) => l.campanaLabel ?? l.campana ?? '(Sin campaña)'

// Link de WhatsApp con el mensaje base (configurable) prellenado, para escribirle
// al lead sin copiar el número. Devuelve null si no hay teléfono válido.
// `plantilla` viene de Configuración (mensajeWACrm); admite {nombre},
// {nombrecompleto}, {clinica} y {telefono}. Si es undefined (config aún sin
// cargar) usa un saludo simple; si es '' (vaciada a propósito) no prellena texto.
function waHref(l: Pick<Lead, 'nombre' | 'apellido' | 'telefono'>, plantilla?: string, clinica?: string): string | null {
  const num = (l.telefono ?? '').replace(/\D/g, '')
  if (!num) return null
  const nombre = (l.nombre ?? '').trim().split(/\s+/)[0]
  const nombreCompleto = `${l.nombre ?? ''} ${l.apellido ?? ''}`.trim()
  let msg: string
  if (plantilla === undefined) {
    msg = nombre ? `Hola ${nombre}, ` : 'Hola, '
  } else {
    msg = plantilla
      .replace(/\{nombrecompleto\}/gi, nombreCompleto)
      .replace(/\{nombre\}/gi, nombre)
      .replace(/\{clinica\}/gi, clinica ?? '')
      .replace(/\{telefono\}/gi, l.telefono ?? '')
  }
  return `https://wa.me/${num}${msg.trim() ? `?text=${encodeURIComponent(msg)}` : ''}`
}

// Exporta a Excel las filas visibles como CSV (separador ; y BOM UTF-8: Excel es-CL
// lo abre directo con acentos correctos). Sin dependencias externas.
function exportarExcel(rows: Lead[], nombre: string) {
  const cols: [string, (l: Lead) => string][] = [
    ['Nombre', (l) => l.nombre ?? ''],
    ['Apellido', (l) => l.apellido ?? ''],
    ['Teléfono', (l) => l.telefono ?? ''],
    ['Email', (l) => l.email ?? ''],
    ['RUT', (l) => l.rut ?? ''],
    ['Estado', (l) => estadoCfg(l.estado).l],
    ['Origen', (l) => origenCfg(l.origen).l],
    ['Campaña', (l) => campanaDe(l)],
    ['Motivo', (l) => l.motivo ?? ''],
    ['Tratamiento', (l) => l.tratamiento ?? ''],
    ['Recibido', (l) => (l.createdAt ? fecha(l.createdAt) : '')],
    ['Hora agendada', (l) => (l.fechaAgenda ? fecha(l.fechaAgenda) : '')],
    ['Asistió', (l) => (l.asistio === true ? 'Sí' : l.asistio === false ? 'No' : '')],
    ['Paciente', (l) => (l.pacienteId ? 'Sí' : 'No')],
  ]
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const lineas = [cols.map((c) => esc(c[0])).join(';')]
  for (const l of rows) lineas.push(cols.map((c) => esc(c[1](l))).join(';'))
  const csv = '﻿' + lineas.join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}-${hoyYmd()}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
// Fechas locales YYYY-MM-DD para el selector de rango.
const ymdLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const hoyYmd = () => ymdLocal(new Date())
const ymdHace = (dias: number) => ymdLocal(new Date(Date.now() - dias * 86400_000))
const inicioMesYmd = () => { const d = new Date(); return ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1)) }
const diasDesde = (iso?: string) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)) : 0)
type Preset = '30' | '7' | 'mes' | 'todo' | 'custom'

export function Crm() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const puedeCrm = esAdmin || Boolean(user?.permisos?.puedeGestionarCrm)
  const [leads, setLeads] = useState<Lead[]>([])
  const [resumen, setResumen] = useState<CrmResumen | null>(null)
  const [campanas, setCampanas] = useState<CampanaItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<string>('')
  const [campana, setCampana] = useState<string>('') // clave de campaña seleccionada ('' = todas)
  const [q, setQ] = useState('')
  const [desde, setDesde] = useState(ymdHace(30)) // siempre visible: últimos 30 días
  const [hasta, setHasta] = useState(hoyYmd())
  const [preset, setPreset] = useState<Preset>('30')
  const [soloSinGestionar, setSoloSinGestionar] = useState(false)
  const [soloReingresos, setSoloReingresos] = useState(false)
  const [sel, setSel] = useState<Lead | null>(null)
  const [modal, setModal] = useState<null | 'nuevo' | 'config' | 'campanas'>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }
  // Plantilla base de WhatsApp para leads + nombre de la clínica (para {clinica}).
  const [waPlantilla, setWaPlantilla] = useState<string | undefined>(undefined)
  const [clinicaNombre, setClinicaNombre] = useState('')
  useEffect(() => { clinicaService.obtener().then((c) => { setWaPlantilla(c.mensajeWACrm); setClinicaNombre(c.nombre) }).catch(() => {}) }, [])

  const aplicarPreset = (p: Preset) => {
    setPreset(p)
    if (p === '30') { setDesde(ymdHace(30)); setHasta(hoyYmd()) }
    else if (p === '7') { setDesde(ymdHace(7)); setHasta(hoyYmd()) }
    else if (p === 'mes') { setDesde(inicioMesYmd()); setHasta(hoyYmd()) }
    else if (p === 'todo') { setDesde(''); setHasta('') }
  }

  const cargar = () => {
    crmService.leads({ estado: estado || undefined, campana: campana || undefined, q: q.trim().length >= 2 ? q.trim() : undefined, desde: desde || undefined, hasta: hasta || undefined })
      .then(setLeads).catch(() => {}).finally(() => setCargando(false))
    crmService.resumen().then(setResumen).catch(() => {})
  }
  const cargarCampanas = () => crmService.campanas({ desde: desde || undefined, hasta: hasta || undefined }).then((r) => setCampanas(r.campanas)).catch(() => {})
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t) }, [estado, campana, q, desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargarCampanas() }, [desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = leads.filter((l) => (!soloSinGestionar || l.sinGestionar) && (!soloReingresos || l.esReingreso))
  const verSinGestionar = () => { setSoloSinGestionar(true); aplicarPreset('todo') } // amplía el rango para ver todos

  if (!puedeCrm) return (
    <div className="max-w-md mx-auto text-center py-16">
      <p className="text-slate-500 text-sm">No tienes acceso al CRM. Pídele a un administrador que te habilite el permiso <span className="font-medium">“Gestionar CRM”</span> en Equipo.</p>
      <Link to="/agenda" className="inline-block mt-3 text-sm text-cyan-700 font-semibold">Volver a la agenda</Link>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">CRM · Leads</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportarExcel(visibles, 'leads')} disabled={visibles.length === 0}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-sm font-semibold rounded-xl">↓ Excel</button>
          {esAdmin && <button onClick={() => setModal('config')} className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl">Configuración / Formulario</button>}
          <button onClick={() => setModal('nuevo')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nuevo lead</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-5">Prospectos captados por formularios web, campañas de Meta y reservas online. Gestiona el seguimiento y conviértelos en pacientes.</p>

      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {/* Alerta: leads sin gestionar hace más de N días */}
      {resumen && resumen.sinGestionar > 0 && (
        <button onClick={verSinGestionar}
          className="w-full mb-4 flex items-center gap-2 text-left bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 hover:bg-rose-100 transition-colors">
          <span className="text-lg leading-none">⏰</span>
          <span className="text-sm font-medium flex-1">
            {resumen.sinGestionar} {resumen.sinGestionar === 1 ? 'lead sin gestionar' : 'leads sin gestionar'} hace más de {resumen.diasSinGestion} días.
          </span>
          <span className="text-xs font-semibold shrink-0">Ver →</span>
        </button>
      )}

      {/* Embudo */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-5">
        <FunnelCard label="Total" v={resumen?.total ?? 0} activo={estado === ''} onClick={() => setEstado('')} />
        {ESTADOS.map((e) => (
          <FunnelCard key={e.k} label={e.l} v={resumen?.estados[e.k] ?? 0} activo={estado === e.k} onClick={() => setEstado(estado === e.k ? '' : e.k)} tone={e.c} />
        ))}
      </div>

      {/* Rango de fechas + búsqueda */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {([['30', 'Últimos 30 días'], ['7', '7 días'], ['mes', 'Este mes'], ['todo', 'Todo']] as [Preset, string][]).map(([k, l]) => (
          <button key={k} onClick={() => aplicarPreset(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${preset === k ? 'border-cyan-400 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{l}</button>
        ))}
        <div className="flex items-center gap-1 ml-auto sm:ml-0">
          <input type="date" value={desde} max={hasta || undefined} onChange={(e) => { setDesde(e.target.value); setPreset('custom') }} className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={hasta} min={desde || undefined} onChange={(e) => { setHasta(e.target.value); setPreset('custom') }} className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono, email o campaña…"
          className="flex-1 min-w-[220px] max-w-md px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {/* Filtro por campaña (por URL de origen renombrable) */}
        <select value={campana} onChange={(e) => setCampana(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 bg-white max-w-[220px]">
          <option value="">Todas las campañas</option>
          {campanas.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.n})</option>)}
        </select>
        {/* Filtro por estado (además del embudo de arriba) */}
        <select value={estado} onChange={(e) => setEstado(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 bg-white">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e.k} value={e.k}>{e.l}</option>)}
        </select>
        {puedeCrm && <button onClick={() => setModal('campanas')} className="px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl">Renombrar campañas</button>}
        <button onClick={() => setSoloReingresos((v) => !v)}
          className={`px-3 py-2.5 rounded-xl text-sm font-medium border ${soloReingresos ? 'bg-amber-100 text-amber-700 border-amber-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          Reingresos{resumen?.reingresos ? ` (${resumen.reingresos})` : ''}{soloReingresos ? ' ✕' : ''}
        </button>
        {soloSinGestionar && (
          <button onClick={() => setSoloSinGestionar(false)} className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
            Solo sin gestionar ✕
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? <p className="px-5 py-10 text-center text-slate-500 text-sm">Cargando…</p>
          : visibles.length === 0 ? <p className="px-5 py-10 text-center text-slate-500 text-sm">{soloSinGestionar ? 'No hay leads sin gestionar 🎉' : `Sin leads ${estado ? 'en este estado' : 'en este período'}. Ajusta el rango o comparte tu formulario.`}</p>
          : visibles.map((l) => {
            const ec = estadoCfg(l.estado)
            const oc = origenCfg(l.origen)
            return (
              <div key={l.id} className={`flex items-center gap-2 px-5 py-3 hover:bg-slate-50 ${l.sinGestionar ? 'bg-rose-50/40' : ''}`}>
                <button onClick={() => setSel(l)} className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-slate-800 truncate">{l.nombre} {l.apellido ?? ''}</p>
                      <span className={`${chip} ${oc.c}`}>{oc.l}</span>
                      {(l.campanaKey || l.campana) && <span className={`${chip} bg-indigo-100 text-indigo-700`} title="Campaña">🎯 {campanaDe(l)}</span>}
                      {l.esReingreso && <span className={`${chip} bg-amber-100 text-amber-700`} title={`Volvió a consultar${l.ultimoIngresoAt ? ` · ${fecha(l.ultimoIngresoAt)}` : ''}`}>↩ Reingreso{(l.vecesIngresado ?? 1) > 2 ? ` ×${l.vecesIngresado}` : ''}</span>}
                      {l.sinGestionar && <span className={`${chip} bg-rose-100 text-rose-700`}>⏰ Sin gestionar{l.ultimaGestionAt ? ` · ${diasDesde(l.ultimaGestionAt)}d` : ''}</span>}
                      {agendoOnline(l) && <span className={`${chip} bg-emerald-100 text-emerald-700`}>Agendó online</span>}
                      {l.pacienteId && <span className={`${chip} bg-slate-100 text-slate-500`}>Paciente</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {l.telefono ?? l.email ?? '—'} · {fecha(l.createdAt)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${ec.c}`}>{ec.l}</span>
                </button>
                {waHref(l, waPlantilla, clinicaNombre)
                  ? <a href={waHref(l, waPlantilla, clinicaNombre)!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Escribir a ${l.nombre} por WhatsApp`}
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors" aria-label="WhatsApp">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.407l-.999 3.648 3.9-1.354zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                    </a>
                  : <span className="shrink-0 w-9 h-9" aria-hidden="true" />}
              </div>
            )
          })}
      </div>

      {sel && <LeadDetalle lead={sel} waPlantilla={waPlantilla} clinicaNombre={clinicaNombre} onClose={() => setSel(null)} onChanged={() => { setSel(null); cargar() }} notify={notify} />}
      {modal === 'nuevo' && <NuevoLeadModal onClose={() => setModal(null)} onCreated={() => { setModal(null); notify('Lead creado'); cargar() }} onError={(m) => notify(m, false)} />}
      {modal === 'config' && <ConfigModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'campanas' && <CampanasModal campanas={campanas} onClose={() => setModal(null)} notify={notify} onSaved={(cs) => { setCampanas(cs); cargar() }} />}
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

function LeadDetalle({ lead, waPlantilla, clinicaNombre, onClose, onChanged, notify }: { lead: Lead; waPlantilla?: string; clinicaNombre: string; onClose: () => void; onChanged: () => void; notify: (t: string, ok?: boolean) => void }) {
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

      {/* Historial de ingresos (reingresos): cuántas veces consultó y por qué canal */}
      {(full.vecesIngresado ?? 1) > 1 && (
        <div className="border-t border-slate-100 pt-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">↩ Reingresos · consultó {full.vecesIngresado} veces</p>
          <ol className="space-y-1.5">
            {parseIngresos(full.ingresos).slice().reverse().map((ing, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-600">
                  <span className="font-medium text-slate-700">{ing.fecha ? fecha(ing.fecha) : '—'}</span>
                  {' · '}{ing.origen ?? '—'}
                  {(ing.campana || ing.utmCampaign) ? ` · ${ing.campana ?? ing.utmCampaign}` : ''}
                  {ing.leadgenId ? ` · leadgen ${ing.leadgenId}` : ''}
                </span>
              </li>
            ))}
          </ol>
          {(full.ultimoOrigen || full.ultimaCampana) && (
            <p className="text-[11px] text-slate-400 mt-2">Último toque: {full.ultimoOrigen ?? '—'}{full.ultimaCampana ? ` · ${full.ultimaCampana}` : ''} (la atribución original se conserva arriba).</p>
          )}
        </div>
      )}

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
          <span className={`px-2 py-0.5 rounded-full ${full.metaEnviado ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>Lead {full.metaEnviado ? '✓ confirmado en Meta' : 'sin confirmar'}</span>
          {(full.origen === 'AGENDA_ONLINE' || full.scheduleEventId) && (
            <span className={`px-2 py-0.5 rounded-full ${full.scheduleCapiEnviado ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>Schedule {full.scheduleCapiEnviado ? '✓ confirmado en Meta' : 'sin confirmar'}</span>
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

      {waHref(full, waPlantilla, clinicaNombre) && (
        <a href={waHref(full, waPlantilla, clinicaNombre)!} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full mb-3 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.407l-.999 3.648 3.9-1.354zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          Escribir por WhatsApp
        </a>
      )}
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

// Renombra campañas: cada fila muestra la clave/URL cruda y su nombre visible
// editable. Guardar un nombre vacío restaura la URL original.
function CampanasModal({ campanas, onClose, notify, onSaved }: {
  campanas: CampanaItem[]; onClose: () => void; notify: (t: string, ok?: boolean) => void; onSaved: (cs: CampanaItem[]) => void
}) {
  const [nombres, setNombres] = useState<Record<string, string>>(() => Object.fromEntries(campanas.map((c) => [c.key, c.label])))
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // No se puede renombrar "sin campaña" (clave vacía).
  const items = campanas.filter((c) => c.key !== '')

  async function guardar(key: string) {
    setSavingKey(key)
    try {
      const r = await crmService.renombrarCampana(key, (nombres[key] ?? '').trim())
      onSaved(r.campanas); notify('Campaña actualizada')
    } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } finally { setSavingKey(null) }
  }

  return (
    <Modal title="Renombrar campañas" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Ponle un nombre corto a cada campaña (o a su URL de origen) para que no se vea la dirección completa en la lista. Deja el nombre vacío para volver a mostrar la URL.</p>
      {items.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Aún no hay campañas con leads en el período seleccionado.</p> : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((c) => (
            <div key={c.key} className="border border-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-400 font-mono break-all mb-1">{c.key} · {c.n} lead{c.n !== 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <input value={nombres[c.key] ?? ''} onChange={(e) => setNombres((s) => ({ ...s, [c.key]: e.target.value }))}
                  placeholder="Nombre visible (ej: Implantes)" className={inp} />
                <button onClick={() => guardar(c.key)} disabled={savingKey === c.key}
                  className="shrink-0 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl disabled:opacity-50">{savingKey === c.key ? '…' : 'Guardar'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex pt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
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
  const [dias, setDias] = useState('4')
  const [busy, setBusy] = useState(false)
  const [editToken, setEditToken] = useState(false)
  const [probando, setProbando] = useState(false)
  const [testRes, setTestRes] = useState<{ ok: boolean; msg: string } | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillRes, setBackfillRes] = useState<string | null>(null)
  const [apiKeyOn, setApiKeyOn] = useState(false)
  const [nuevaKey, setNuevaKey] = useState<string | null>(null)
  // Integración de CRM con Meta (dataset + token propios, canal aparte del Pixel web).
  const [crmOn, setCrmOn] = useState(false)
  const [crmDataset, setCrmDataset] = useState('')
  const [crmToken, setCrmToken] = useState('')
  const [editCrmToken, setEditCrmToken] = useState(false)
  const [probandoCrm, setProbandoCrm] = useState(false)
  const [crmTestRes, setCrmTestRes] = useState<{ ok: boolean; msg: string } | null>(null)
  // Recepción nativa de Lead Ads (webhook): página + token propios de la clínica.
  const [leadAdsOn, setLeadAdsOn] = useState(false)
  const [pageId, setPageId] = useState('')
  const [pageToken, setPageToken] = useState('')
  const [editPageToken, setEditPageToken] = useState(false)
  const [probandoRec, setProbandoRec] = useState(false)
  const [recRes, setRecRes] = useState<{ ok: boolean; msg: string } | null>(null)
  const [reproId, setReproId] = useState('')
  const [reproBusy, setReproBusy] = useState(false)
  const [reproRes, setReproRes] = useState<import('../services/crm.service').MetaReprocesoResult | null>(null)
  // El slug se guarda aparte y solo se actualiza con un valor no vacío: así una
  // respuesta que no lo traiga (o venga vacío) nunca deja las URLs en "undefined".
  const [slug, setSlug] = useState('')
  useEffect(() => {
    crmService.config().then((c) => {
      setCfg(c); if (c.slug) setSlug(c.slug)
      // El test code solo se precarga si sigue ACTIVO; si expiró, se deja vacío para
      // que un "Guardar" de otra config no lo reactive por accidente.
      setPixel(c.metaPixelId ?? ''); setTest(c.testCodeActivo ? (c.metaTestCode ?? '') : ''); setEnabled(c.metaEnabled); setDias(String(c.diasSinGestion))
      setCrmOn(c.metaCrmEnabled); setCrmDataset(c.metaCrmDatasetId ?? '')
      setLeadAdsOn(c.metaLeadAdsEnabled); setPageId(c.metaPageId ?? '')
    }).catch(() => {})
    crmService.apiKeyEstado().then((r) => setApiKeyOn(r.hasApiKey)).catch(() => {})
  }, [])

  async function probarCrm() {
    setProbandoCrm(true); setCrmTestRes(null)
    try {
      const r = await crmService.probarMetaCrm()
      setCrmTestRes(r.ok
        ? { ok: true, msg: `Conexión válida · Meta aceptó el evento de prueba${r.testCode ? ` (código ${r.testCode})` : ''}. Búscalo en Events Manager → Eventos de prueba.` }
        : { ok: false, msg: r.error ?? 'No se pudo validar la conexión de CRM.' })
    } catch (e) { setCrmTestRes({ ok: false, msg: e instanceof ApiError ? e.message : 'Error al probar la conexión.' }) } finally { setProbandoCrm(false) }
  }

  async function probarRecepcion() {
    setProbandoRec(true); setRecRes(null)
    try {
      const r = await crmService.probarRecepcionLeadAds()
      const u = r.ultimo
      const ultimoTxt = u?.at ? ` · Último lead recibido: ${new Date(u.at).toLocaleString('es-CL')}${u.duplicado ? ' (duplicado, no recreado)' : u.reconciliado ? ' (reconciliado)' : ''}` : ' · Aún no llega ningún lead por el webhook.'
      setRecRes(r.ok
        ? { ok: true, msg: `Conexión con la página "${r.pagina}" OK.${ultimoTxt}` }
        : { ok: false, msg: (r.error ?? 'No se pudo validar la recepción.') + (u?.at ? ultimoTxt : '') })
    } catch (e) { setRecRes({ ok: false, msg: e instanceof ApiError ? e.message : 'Error al probar la recepción.' }) } finally { setProbandoRec(false) }
  }

  async function reprocesar() {
    if (!reproId.trim()) return
    setReproBusy(true); setReproRes(null)
    try {
      setReproRes(await crmService.reprocesarLead(reproId.trim()))
    } catch (e) {
      setReproRes({ leadgenId: reproId.trim(), graphRequest: '', graphStatus: 0, graphError: null, resultado: 'error', configError: e instanceof ApiError ? e.message : 'Error al reprocesar.' })
    } finally { setReproBusy(false) }
  }

  async function generarKey() {
    if (apiKeyOn && !confirm('Ya hay una API key activa. Al generar una nueva, la anterior deja de funcionar de inmediato. ¿Continuar?')) return
    try { const r = await crmService.rotarApiKey(); setNuevaKey(r.apiKey); setApiKeyOn(true); notify('API key generada') } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  async function revocarKey() {
    if (!confirm('¿Revocar la API key? Las integraciones (incluido el MCP de Claude) dejarán de funcionar.')) return
    try { await crmService.revocarApiKey(); setApiKeyOn(false); setNuevaKey(null); notify('API key revocada') } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  // Base ABSOLUTA del backend (api.clariva.cl), NO window.location.origin: el panel
  // corre en el subdominio del frontend (<slug>.clariva.cl), pero la API pública y
  // el MCP viven en el backend. Usar el origin del navegador apuntaría al SPA.
  const apiBase = import.meta.env.VITE_API_URL ?? '/api/v1'
  const apiAbs = apiBase.startsWith('http') ? apiBase.replace(/\/$/, '') : `${window.location.origin}${apiBase}`
  const mcpBase = apiAbs

  async function probar() {
    setProbando(true); setTestRes(null)
    try {
      const r = await crmService.probarMeta()
      setTestRes(r.ok
        ? { ok: true, msg: `Token válido · Meta aceptó el evento de prueba${r.testCode ? ` (código ${r.testCode})` : ''}.` }
        : { ok: false, msg: r.error ?? 'No se pudo validar el token.' })
    } catch (e) { setTestRes({ ok: false, msg: e instanceof ApiError ? e.message : 'Error al probar la conexión.' }) } finally { setProbando(false) }
  }

  async function backfill() {
    if (!confirm('Reenviar el evento Schedule a Meta para todos los leads AGENDADO que aún no lo tienen confirmado. ¿Continuar?')) return
    setBackfilling(true); setBackfillRes(null)
    try {
      const r = await crmService.backfillSchedule()
      setBackfillRes(`Enviados: ${r.enviados} · Omitidos (sin datos de match): ${r.omitidos} · Errores: ${r.errores} · Total revisados: ${r.total}`)
      notify('Backfill completado')
    } catch (e) { setBackfillRes(e instanceof ApiError ? e.message : 'Error en el backfill'); notify('Error en el backfill', false) } finally { setBackfilling(false) }
  }

  // El formulario hospedado es una ruta del SPA → va en el origin del frontend.
  // Todas las URLs se arman con `slug` (estado protegido) + el token del cfg. Si el
  // slug aún no está, quedan vacías y la UI muestra "Cargando…" en vez de una URL rota.
  const urlListo = Boolean(slug && cfg?.crmToken)
  const formUrl = urlListo ? `${window.location.origin}/c/${slug}/formulario/${cfg!.crmToken}` : ''
  // El intake es una ruta del BACKEND → va en api.clariva.cl (apiAbs), no en el frontend.
  const intakeUrl = urlListo ? `${apiAbs}/public/crm/${slug}/${cfg!.crmToken}/lead` : ''
  // Intake del Formulario Instantáneo de Meta (Make → POST con leadgen_id).
  const metaLeadUrl = urlListo ? `${apiAbs}/public/crm/${slug}/${cfg!.crmToken}/meta-lead` : ''
  // Webhook nativo de Lead Ads: URL de PLATAFORMA (misma para todas las clínicas;
  // el enrutamiento es por Page ID, no por slug → nunca "undefined").
  const webhookUrl = `${apiAbs}/public/meta/leadgen-webhook`

  const editandoToken = !cfg?.hasCapiToken || editToken // el input del token está visible
  const editandoCrmToken = !cfg?.hasCrmToken || editCrmToken
  const editandoPageToken = !cfg?.hasPageToken || editPageToken

  async function guardar() {
    setBusy(true)
    try {
      const payload: Record<string, unknown> = { metaEnabled: enabled, metaPixelId: pixel.trim() || null, metaTestCode: test.trim() || null, diasSinGestion: Number(dias) || 4,
        metaCrmEnabled: crmOn, metaCrmDatasetId: crmDataset.trim() || null,
        metaLeadAdsEnabled: leadAdsOn, metaPageId: pageId.trim() || null }
      // Solo tocamos el token si el campo estaba visible y el usuario escribió algo:
      // así un autocompletado del navegador nunca puede sobrescribir el token real.
      if (editandoToken && token.trim()) payload.metaCapiToken = token.trim()
      if (editandoCrmToken && crmToken.trim()) payload.metaCrmAccessToken = crmToken.trim()
      if (editandoPageToken && pageToken.trim()) payload.metaPageAccessToken = pageToken.trim()
      const c = await crmService.guardarConfig(payload); setCfg(c); if (c.slug) setSlug(c.slug); setToken(''); setEditToken(false); setTestRes(null)
      setCrmToken(''); setEditCrmToken(false); setCrmTestRes(null)
      setPageToken(''); setEditPageToken(false); setRecRes(null); notify('Configuración guardada')
    } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } finally { setBusy(false) }
  }
  const copiar = (t: string) => { navigator.clipboard.writeText(t).then(() => notify('Copiado')).catch(() => {}) }

  async function desactivarTestCode() {
    try { const c = await crmService.guardarConfig({ metaTestCode: null }); setCfg(c); setTest(''); notify('Test Event Code desactivado — los eventos vuelven a contar') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <Modal title="Configuración del CRM" onClose={onClose}>
      {!cfg ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Captación web</p>
            <p className="text-xs text-slate-500 mb-2">Formulario hospedado (compartilo o insértalo con un iframe):</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-2">
              <span className="text-xs font-mono text-slate-500 truncate flex-1">{formUrl || 'Cargando…'}</span>
              <button onClick={() => copiar(formUrl)} disabled={!urlListo} className="text-xs font-semibold text-cyan-700 shrink-0 disabled:opacity-40">Copiar</button>
              {urlListo && <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 shrink-0">Abrir</a>}
            </div>
            <p className="text-xs text-slate-500 mb-1">Endpoint de intake (para tu formulario web / App Script → POST JSON):</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-xs font-mono text-slate-500 truncate flex-1">{intakeUrl || 'Cargando…'}</span>
              <button onClick={() => copiar(intakeUrl)} disabled={!urlListo} className="text-xs font-semibold text-cyan-700 shrink-0 disabled:opacity-40">Copiar</button>
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
            <p className="text-[11px] text-slate-400 mt-2">El código al final de estas URLs (~12 caracteres) es el <span className="font-medium">token del formulario</span> — es normal que sea corto y <span className="font-medium">no</span> es el token de Meta.</p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Seguimiento</p>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Alertar leads sin gestionar después de (días)</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={1} max={90} value={dias} onChange={(e) => setDias(e.target.value)} className={`${inp} font-mono w-24`} />
                <span className="text-xs text-slate-400">días (1–90)</span>
              </div>
            </label>
            <p className="text-[11px] text-slate-400 mt-1">Un lead en estado Nuevo/Contactado sin gestión humana (nota, cambio de estado, agendar) por más de este tiempo aparece en la alerta.</p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enviar eventos a Meta (Pixel + Conversions API)
            </label>
            <label className="block mb-2"><span className="text-xs font-medium text-slate-500">Pixel ID</span>
              <input value={pixel} onChange={(e) => setPixel(e.target.value)} placeholder="123456789012345" className={`${inp} font-mono`} /></label>
            <span className="block text-xs font-medium text-slate-500 mb-1">Conversions API — Access Token</span>
            {cfg.hasCapiToken && !editToken ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                <span className="text-xs text-emerald-700 font-semibold">✓ Token cargado correctamente</span>
                <span className="text-[11px] text-slate-500 truncate">· {cfg.capiTokenLen} caracteres · termina en …{cfg.capiTokenLast4}</span>
                <button type="button" onClick={() => { setEditToken(true); setToken('') }} className="ml-auto shrink-0 text-xs font-semibold text-cyan-700 hover:text-cyan-800">Modificar</button>
              </div>
            ) : (
              <div className="mb-2">
                {/* Señuelos + new-password: evitan que el navegador/gestores autocompleten una contraseña guardada aquí. */}
                <input type="text" name="clariva-user-decoy" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" />
                <input
                  type="password" value={token} onChange={(e) => setToken(e.target.value)}
                  name="clariva-meta-capi-token" id="clariva-meta-capi-token"
                  autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  data-lpignore="true" data-1p-ignore data-form-type="other"
                  placeholder={cfg.hasCapiToken ? 'Pega el nuevo token' : 'Pega el token de Conversions API'}
                  className={`${inp} font-mono`} />
                {cfg.hasCapiToken && editToken && (
                  <button type="button" onClick={() => { setEditToken(false); setToken('') }} className="mt-1 text-xs text-slate-500 hover:text-slate-700">Cancelar (mantener el token actual)</button>
                )}
                {!cfg.hasCapiToken && <p className="text-[11px] text-amber-600 mt-1">Aún no hay token de Conversions API guardado.</p>}
              </div>
            )}
            {cfg.testCodeActivo && (
              <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-amber-800">⚠️ Test Event Code ACTIVO — los eventos NO cuentan para optimización ni atribución.</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Se auto-desactiva {cfg.testCodeHasta ? `el ${fecha(cfg.testCodeHasta)}` : 'en ~2 h'}. Úsalo solo para depurar en Test Events.
                  <button type="button" onClick={desactivarTestCode} className="ml-2 font-semibold text-amber-900 underline">Desactivar ahora</button>
                </p>
              </div>
            )}
            <label className="block"><span className="text-xs font-medium text-slate-500">Test Event Code (solo para depurar; se auto-desactiva en ~2 h)</span>
              <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Vacío en producción" className={`${inp} font-mono`} /></label>
            <p className="text-[11px] text-slate-400 mt-1">Déjalo <span className="font-medium">vacío en producción</span>. Al guardarlo con un valor se activa por ~2 h y luego se apaga solo, para que los eventos vuelvan a contar.</p>

            <div className="mt-3 flex items-center gap-2">
              <button onClick={probar} disabled={probando || !cfg.hasCapiToken || !pixel.trim()}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg">
                {probando ? 'Probando…' : 'Probar conexión con Meta'}
              </button>
              {testRes && <span className={`text-xs font-medium ${testRes.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{testRes.ok ? '✓' : '✗'} {testRes.msg}</span>}
            </div>
            {/* Backfill del evento Schedule para los leads ya AGENDADO sin confirmar */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button onClick={backfill} disabled={backfilling || !cfg.hasCapiToken}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg">
                {backfilling ? 'Reenviando…' : 'Reenviar Schedule a AGENDADO pendientes'}
              </button>
              {backfillRes && <span className="text-xs text-slate-600">{backfillRes}</span>}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">El token se guarda oculto por seguridad (por eso no se vuelve a mostrar). "Probar conexión" envía un evento de prueba marcado como test — <span className="font-medium">no afecta tus métricas ni tu reporte</span>. Ingresa tu Test Event Code (de Meta → Eventos de prueba) para verlo entrar en vivo. Los eventos reales (Lead, Schedule) se deduplican con el Pixel por event_id.</p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Integración con Meta Ads (clientes potenciales calificados)</p>
            <p className="text-[11px] text-slate-500 mb-3">Envía las etapas del embudo (Lead → Contactado → Agendado → Cliente) al dataset de CRM de tu clínica para optimizar campañas de Formulario Instantáneo por <span className="font-medium">agendamiento</span>. Es independiente del Pixel de la landing. Obtén tu <span className="font-medium">Dataset ID</span> y <span className="font-medium">token</span> en Meta Events Manager → Conectar datos → CRM → Conectar manualmente.</p>
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
              <input type="checkbox" checked={crmOn} onChange={(e) => setCrmOn(e.target.checked)} />
              Activar integración de CRM con Meta
            </label>
            <label className="block mb-2"><span className="text-xs font-medium text-slate-500">Dataset ID (CRM)</span>
              <input value={crmDataset} onChange={(e) => setCrmDataset(e.target.value)} placeholder="1234567890123456" className={`${inp} font-mono`} /></label>
            <span className="block text-xs font-medium text-slate-500 mb-1">Token de acceso (CRM)</span>
            {cfg.hasCrmToken && !editCrmToken ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                <span className="text-xs text-emerald-700 font-semibold">✓ Token cargado</span>
                {cfg.crmTokenLast4 && <span className="text-[11px] text-slate-500 truncate">· termina en …{cfg.crmTokenLast4}</span>}
                <button type="button" onClick={() => { setEditCrmToken(true); setCrmToken('') }} className="ml-auto shrink-0 text-xs font-semibold text-cyan-700 hover:text-cyan-800">Modificar</button>
              </div>
            ) : (
              <div className="mb-2">
                <input type="text" name="clariva-crm-decoy" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" />
                <input
                  type="password" value={crmToken} onChange={(e) => setCrmToken(e.target.value)}
                  name="clariva-meta-crm-token" id="clariva-meta-crm-token"
                  autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  data-lpignore="true" data-1p-ignore data-form-type="other"
                  placeholder={cfg.hasCrmToken ? 'Pega el nuevo token' : 'Pega el token de CRM'}
                  className={`${inp} font-mono`} />
                {cfg.hasCrmToken && editCrmToken && (
                  <button type="button" onClick={() => { setEditCrmToken(false); setCrmToken('') }} className="mt-1 text-xs text-slate-500 hover:text-slate-700">Cancelar (mantener el token actual)</button>
                )}
                {!cfg.hasCrmToken && <p className="text-[11px] text-amber-600 mt-1">Aún no hay token de CRM guardado.</p>}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button onClick={probarCrm} disabled={probandoCrm || !cfg.hasCrmToken || !crmDataset.trim()}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg">
                {probandoCrm ? 'Enviando…' : 'Enviar evento de prueba'}
              </button>
              {crmTestRes && <span className={`text-xs font-medium ${crmTestRes.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{crmTestRes.ok ? '✓' : '✗'} {crmTestRes.msg}</span>}
            </div>
            <p className="text-[11px] text-slate-500 mt-3 mb-1">Endpoint para leads del Formulario Instantáneo (Make → POST JSON con <span className="font-mono">leadgenId</span>):</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-xs font-mono text-slate-500 truncate flex-1">{metaLeadUrl || 'Cargando…'}</span>
              <button type="button" onClick={() => copiar(metaLeadUrl)} disabled={!urlListo} className="text-xs font-semibold text-cyan-700 shrink-0 disabled:opacity-40">Copiar</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Usa el mismo Test Event Code de arriba para la prueba. El token se guarda encriptado y no se vuelve a mostrar.</p>

            {/* Recepción NATIVA de leads del Formulario Instantáneo (webhook, sin Make) */}
            <div className="mt-4 pt-3 border-t border-dashed border-slate-200">
              <p className="text-[11px] font-semibold text-slate-600 mb-1">Recepción automática de leads (sin Make)</p>
              <p className="text-[11px] text-slate-500 mb-3">Recibe los leads del Formulario Instantáneo directo desde Meta. Autoriza tu página de Facebook en la App de Cláriva y pega aquí el Page ID + token de página larga duración. La clínica se identifica por su <span className="font-medium">Page ID</span>.</p>
              <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
                <input type="checkbox" checked={leadAdsOn} onChange={(e) => setLeadAdsOn(e.target.checked)} />
                Recibir leads del Formulario Instantáneo
              </label>
              <label className="block mb-2"><span className="text-xs font-medium text-slate-500">Page ID (página de Facebook de la clínica)</span>
                <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="1234567890" className={`${inp} font-mono`} /></label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Token de página (larga duración)</span>
              {cfg.hasPageToken && !editPageToken ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                  <span className="text-xs text-emerald-700 font-semibold">✓ Token cargado</span>
                  {cfg.pageTokenLast4 && <span className="text-[11px] text-slate-500 truncate">· termina en …{cfg.pageTokenLast4}</span>}
                  <button type="button" onClick={() => { setEditPageToken(true); setPageToken('') }} className="ml-auto shrink-0 text-xs font-semibold text-cyan-700 hover:text-cyan-800">Modificar</button>
                </div>
              ) : (
                <div className="mb-2">
                  <input type="text" name="clariva-page-decoy" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" />
                  <input
                    type="password" value={pageToken} onChange={(e) => setPageToken(e.target.value)}
                    name="clariva-meta-page-token" id="clariva-meta-page-token"
                    autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    data-lpignore="true" data-1p-ignore data-form-type="other"
                    placeholder={cfg.hasPageToken ? 'Pega el nuevo token de página' : 'Pega el token de página'}
                    className={`${inp} font-mono`} />
                  {cfg.hasPageToken && editPageToken && (
                    <button type="button" onClick={() => { setEditPageToken(false); setPageToken('') }} className="mt-1 text-xs text-slate-500 hover:text-slate-700">Cancelar (mantener el token actual)</button>
                  )}
                  {!cfg.hasPageToken && <p className="text-[11px] text-amber-600 mt-1">Aún no hay token de página guardado.</p>}
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-3 mb-1">URL del webhook (pégala en la App de Meta → Webhooks → objeto <span className="font-mono">page</span>, campo <span className="font-mono">leadgen</span>):</p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-slate-500 truncate flex-1">{webhookUrl}</span>
                <button type="button" onClick={() => copiar(webhookUrl)} className="text-xs font-semibold text-cyan-700 shrink-0">Copiar</button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Es la misma URL para todas las clínicas: Meta enruta cada lead por el Page ID.</p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button onClick={probarRecepcion} disabled={probandoRec || !cfg.hasPageToken || !pageId.trim()}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg">
                  {probandoRec ? 'Probando…' : 'Probar recepción'}
                </button>
                {recRes && <span className={`text-xs font-medium ${recRes.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{recRes.ok ? '✓' : '✗'} {recRes.msg}</span>}
              </div>

              {/* Reproceso manual por leadgen_id (validar sin gastar en anuncios) */}
              <div className="mt-4">
                <p className="text-[11px] font-medium text-slate-500 mb-1">Reprocesar lead por Leadgen ID (mismo pipeline que el webhook):</p>
                <div className="flex items-center gap-2">
                  <input value={reproId} onChange={(e) => setReproId(e.target.value)} placeholder="Leadgen ID" className={`${inp} font-mono flex-1`} />
                  <button onClick={reprocesar} disabled={reproBusy || !reproId.trim()} className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg shrink-0">{reproBusy ? 'Procesando…' : 'Reprocesar lead'}</button>
                </div>
                {reproRes && (() => {
                  const r = reproRes
                  const okTono = r.resultado === 'creado' || r.resultado === 'duplicado'
                  const ge = r.graphError
                  return (
                    <div className={`mt-2 rounded-lg border p-2 text-[11px] space-y-1 ${okTono ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      {r.configError ? (
                        <p className="text-rose-700 font-semibold">✗ {r.configError}</p>
                      ) : (
                        <>
                          <p className={`font-semibold ${okTono ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {okTono ? '✓' : '✗'} resultado: {r.resultado}
                            {r.leadId ? ` · lead ${r.lead?.nombre ?? ''} ${r.lead?.apellido ?? ''}`.trimEnd() : ''}
                          </p>
                          <p className="text-slate-600">Graph {r.graphStatus}{ge ? ` · error code ${ge.code}${ge.subcode ? `/${ge.subcode}` : ''}: ${ge.message}` : ' · sin error'}</p>
                          {r.mapeo && (
                            <p className="text-slate-600">Mapeo: <span className="font-mono">{[r.mapeo.nombre, r.mapeo.telefono, r.mapeo.email].filter(Boolean).join(' · ') || '—'}</span>
                              {r.mapeo.noReconocidos.length > 0 && <span className="text-amber-700"> · sin reconocer: {r.mapeo.noReconocidos.join(', ')}</span>}</p>
                          )}
                        </>
                      )}
                      <details open={!okTono}><summary className="cursor-pointer text-slate-500">Respuesta completa (diagnóstico)</summary>
                        <pre className="mt-1 max-h-72 overflow-auto text-[10px] text-slate-600 whitespace-pre-wrap bg-white/60 rounded p-2">{JSON.stringify(r, null, 2)}</pre>
                      </details>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Acceso para Claude (MCP)</p>
            <p className="text-[11px] text-slate-500 mb-2">Acceso de <span className="font-medium">solo lectura</span> para que Claude (Desktop/Code) consulte tus leads y estadísticas vía el servidor MCP de Cláriva.</p>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-medium ${apiKeyOn ? 'text-emerald-600' : 'text-slate-500'}`}>{apiKeyOn ? '✓ API key activa' : 'Sin API key'}</span>
              <button type="button" onClick={generarKey} className="ml-auto px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg">{apiKeyOn ? 'Rotar key' : 'Generar API key'}</button>
              {apiKeyOn && <button type="button" onClick={revocarKey} className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-rose-600 text-xs font-semibold rounded-lg">Revocar</button>}
            </div>
            {nuevaKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                <p className="text-[11px] text-amber-700 mb-1 font-semibold">Cópiala ahora — no se vuelve a mostrar:</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-700 truncate flex-1">{nuevaKey}</span>
                  <button type="button" onClick={() => copiar(nuevaKey)} className="text-xs font-semibold text-cyan-700 shrink-0">Copiar</button>
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mb-1">Base URL para el MCP:</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-xs font-mono text-slate-500 truncate flex-1">{mcpBase}</span>
              <button type="button" onClick={() => copiar(mcpBase)} className="text-xs font-semibold text-cyan-700 shrink-0">Copiar</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Configura la carpeta <span className="font-mono">mcp-server</span> con esta Base URL y tu API key (ver su README).</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        {children}
      </div>
    </div>
  )
}
