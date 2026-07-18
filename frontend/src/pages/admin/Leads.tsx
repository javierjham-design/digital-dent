import { useEffect, useMemo, useState } from 'react'
import { adminService } from '@/services/admin.service'

interface Lead {
  id: string; nombre: string; email: string; telefono: string | null; nombreClinica: string | null
  rubro: string | null; origen: string; clinicaSlug: string | null
  estado: string; pais: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null
  notas: string | null; gestionadoAt: string | null; createdAt: string
}
const RUBRO: Record<string, string> = { dental: 'Dental', medico: 'Médico', estetica: 'Estética' }
const ESTADOS: Record<string, { label: string; chip: string; dot: string }> = {
  NUEVO:       { label: 'Nuevo',        chip: 'bg-slate-700 text-slate-200',        dot: 'bg-slate-400' },
  CONTACTADO:  { label: 'Contactado',   chip: 'bg-blue-500/15 text-blue-300',       dot: 'bg-blue-400' },
  DEMO_ACTIVA: { label: 'Demo activa',  chip: 'bg-cyan-500/15 text-cyan-300',       dot: 'bg-cyan-400' },
  NEGOCIACION: { label: 'Negociación',  chip: 'bg-amber-500/15 text-amber-300',     dot: 'bg-amber-400' },
  GANADO:      { label: 'Ganado',       chip: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400' },
  PERDIDO:     { label: 'Perdido',      chip: 'bg-rose-500/15 text-rose-300',       dot: 'bg-rose-400' },
}
const ORDEN = ['NUEVO', 'CONTACTADO', 'DEMO_ACTIVA', 'NEGOCIACION', 'GANADO', 'PERDIDO']
const wa = (tel: string | null) => { const n = (tel ?? '').replace(/\D/g, ''); return n.length >= 8 ? `https://wa.me/${n}` : null }
const fecha = (s: string) => new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })

export function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<string | null>(null)

  const cargar = () => adminService.leads().then((r) => setLeads(r.leads as Lead[])).finally(() => setCargando(false))
  useEffect(() => { cargar() }, [])

  const conteos = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of leads) c[l.estado] = (c[l.estado] ?? 0) + 1
    return c
  }, [leads])

  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase()
    return leads.filter((l) =>
      (!filtro || l.estado === filtro) &&
      (!n || `${l.nombre} ${l.email} ${l.nombreClinica ?? ''} ${l.utmCampaign ?? ''}`.toLowerCase().includes(n)),
    )
  }, [leads, q, filtro])

  async function cambiar(id: string, patch: { estado?: string; notas?: string | null }) {
    setLeads((ls) => ls.map((l) => l.id === id ? { ...l, ...patch, gestionadoAt: new Date().toISOString() } : l))
    await adminService.actualizarLead(id, patch).catch(() => cargar())
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Leads / CRM de ventas</h1>
      <p className="text-slate-400 text-sm mb-5">Prospectos captados desde las landings y campañas. Gestiona el ciclo de venta, contáctalos y mide qué campaña convierte.</p>

      {/* Pipeline */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
        {ORDEN.map((e) => (
          <button key={e} onClick={() => setFiltro((f) => f === e ? null : e)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${filtro === e ? 'border-purple-500 bg-purple-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
            <p className="text-[11px] text-slate-400 truncate">{ESTADOS[e].label}</p>
            <p className="text-xl font-bold text-white">{conteos[e] ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email, clínica o campaña…"
          className="flex-1 min-w-[16rem] px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
        {filtro && <button onClick={() => setFiltro(null)} className="text-xs text-slate-400 hover:text-white">Ver todos</button>}
        <span className="text-xs text-slate-500">{filtrados.length} lead{filtrados.length === 1 ? '' : 's'}</span>
      </div>

      {cargando ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Cargando…</p>
        : filtrados.length === 0 ? <p className="px-6 py-10 text-center text-slate-500 text-sm">No hay leads{filtro ? ' en este estado' : ''}.</p>
        : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtrados.map((l) => <LeadCard key={l.id} lead={l} onChange={cambiar} />)}
          </div>
        )}
    </div>
  )
}

function LeadCard({ lead: l, onChange }: { lead: Lead; onChange: (id: string, patch: { estado?: string; notas?: string | null }) => void }) {
  const [notas, setNotas] = useState(l.notas ?? '')
  const [verNotas, setVerNotas] = useState(false)
  const est = ESTADOS[l.estado] ?? ESTADOS.NUEVO
  const waLink = wa(l.telefono)
  const campana = [l.utmSource, l.utmCampaign].filter(Boolean).join(' · ')

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${est.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />{est.label}</span>
            {l.rubro && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{RUBRO[l.rubro] ?? l.rubro}</span>}
            {l.pais && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{l.pais}</span>}
          </div>
          <p className="text-white font-semibold mt-1.5 truncate">{l.nombre}</p>
          <p className="text-xs text-slate-400 truncate">{l.nombreClinica ?? 'Sin clínica'}</p>
        </div>
        <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">{fecha(l.createdAt)}</span>
      </div>

      {/* Contacto */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 text-xs font-semibold">💬 WhatsApp</a>}
        {l.telefono && <a href={`tel:${l.telefono}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold">📞 {l.telefono}</a>}
        <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold break-all">✉ {l.email}</a>
        {l.clinicaSlug && <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-500 text-xs">Demo: {l.clinicaSlug}</span>}
      </div>

      {campana && <p className="text-[11px] text-slate-500 mt-2">📈 Campaña: <span className="text-slate-300">{campana}</span></p>}

      {/* Gestión */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
        <select value={l.estado} onChange={(e) => onChange(l.id, { estado: e.target.value })}
          className="flex-1 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
          {ORDEN.map((e) => <option key={e} value={e}>{ESTADOS[e].label}</option>)}
        </select>
        <button onClick={() => setVerNotas((v) => !v)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg shrink-0">{l.notas ? '📝 Notas' : '+ Nota'}</button>
      </div>

      {verNotas && (
        <div className="mt-2">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} onBlur={() => { if (notas !== (l.notas ?? '')) onChange(l.id, { notas: notas || null }) }}
            rows={3} placeholder="Notas de seguimiento (llamadas, acuerdos, próximos pasos…)"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <p className="text-[10px] text-slate-600 mt-1">{l.gestionadoAt ? `Última gestión: ${new Date(l.gestionadoAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin gestión aún'}</p>
        </div>
      )}
    </div>
  )
}
