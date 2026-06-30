import { useEffect, useState } from 'react'
import { agendaOnlineService, type LinkAgendaDTO, type ReservaOnline, type Ventana } from '@/services/agenda-online.service'
import { usuariosService } from '@/services/equipo.service'
import type { DoctorDTO } from '@shared/types'
import { ApiError } from '@/services/api'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

export function AgendaOnline() {
  const [slug, setSlug] = useState('')
  const [links, setLinks] = useState<LinkAgendaDTO[]>([])
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [editar, setEditar] = useState<null | 'nuevo' | LinkAgendaDTO>(null)
  const [reservasDe, setReservasDe] = useState<LinkAgendaDTO | null>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargar = () => agendaOnlineService.listar().then((r) => { setSlug(r.slug); setLinks(r.links) }).catch(() => {}).finally(() => setCargando(false))
  useEffect(() => { cargar(); usuariosService.doctores().then(setDoctores).catch(() => {}) }, [])

  const urlDe = (l: LinkAgendaDTO) => `${window.location.origin}/c/${slug}/agendar/${l.token}`
  async function copiar(l: LinkAgendaDTO) {
    try { await navigator.clipboard.writeText(urlDe(l)); notify('Link copiado al portapapeles') }
    catch { notify('No se pudo copiar; copia la URL manualmente', false) }
  }
  async function togglar(l: LinkAgendaDTO) {
    try { await agendaOnlineService.actualizar(l.id, { activo: !l.activo }); cargar() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  async function eliminar(l: LinkAgendaDTO) {
    if (!window.confirm(`¿Eliminar el link "${l.nombre}"? Las citas ya reservadas se conservan.`)) return
    try { await agendaOnlineService.eliminar(l.id); cargar() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Agendamiento online</h1>
        <button onClick={() => setEditar('nuevo')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nuevo link</button>
      </div>
      <p className="text-sm text-slate-500 mb-5">Crea links públicos para que tus pacientes reserven su hora dentro de la disponibilidad. Cada link puede ser para un profesional y un tipo de atención (ej. evaluaciones).</p>

      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p>
        : links.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
            Aún no hay links de agendamiento. Crea el primero con “+ Nuevo link”.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{l.nombre}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${l.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{l.activo ? 'Activo' : 'Pausado'}</span>
                      <span className="text-xs text-slate-400">{l.tipoCita} · {l.duracionMin} min</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{l.doctor.name ?? l.doctor.email} · {l.usaHorarioDoctor ? 'horario del profesional' : `${l.ventanas.length} ventana(s) propia(s)`} · {l.reservas} reserva(s)</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button onClick={() => setReservasDe(l)} className="text-xs font-semibold text-cyan-700 hover:underline">Ver reservas</button>
                    <button onClick={() => setEditar(l)} className="text-xs font-semibold text-slate-600 hover:text-slate-900">Editar</button>
                    <button onClick={() => togglar(l)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{l.activo ? 'Pausar' : 'Activar'}</button>
                    <button onClick={() => eliminar(l)} className="text-xs font-semibold text-slate-300 hover:text-rose-600">Eliminar</button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  <span className="text-xs font-mono text-slate-500 truncate flex-1">{urlDe(l)}</span>
                  <button onClick={() => copiar(l)} className="text-xs font-semibold text-cyan-700 hover:underline shrink-0">Copiar</button>
                  <a href={urlDe(l)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 hover:text-slate-800 shrink-0">Abrir</a>
                </div>
              </div>
            ))}
          </div>
        )}

      {editar && (
        <LinkModal link={editar === 'nuevo' ? null : editar} doctores={doctores}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); notify('Link guardado'); cargar() }}
          onError={(m) => notify(m, false)} />
      )}
      {reservasDe && <ReservasModal link={reservasDe} onClose={() => setReservasDe(null)} />}
    </div>
  )
}

function LinkModal({ link, doctores, onClose, onSaved, onError }: {
  link: LinkAgendaDTO | null; doctores: DoctorDTO[]; onClose: () => void; onSaved: () => void; onError: (m: string) => void
}) {
  const [form, setForm] = useState({
    nombre: link?.nombre ?? '', descripcion: link?.descripcion ?? '',
    doctorId: link?.doctorId ?? doctores[0]?.id ?? '', tipoCita: link?.tipoCita ?? 'EVALUACION',
    duracionMin: String(link?.duracionMin ?? 30), usaHorarioDoctor: link?.usaHorarioDoctor ?? true,
    anticipacionHoras: String(link?.anticipacionHoras ?? 12), diasMaxFuturo: String(link?.diasMaxFuturo ?? 30),
    mensajeConfirmacion: link?.mensajeConfirmacion ?? '',
  })
  const [ventanas, setVentanas] = useState<Ventana[]>(link?.ventanas?.length ? link.ventanas : [{ diaSemana: 1, horaInicio: '15:00', horaFin: '18:00' }])
  const [guardando, setGuardando] = useState(false)
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  async function guardar() {
    if (!form.nombre.trim()) { onError('Falta el nombre del link'); return }
    if (!form.doctorId) { onError('Selecciona un profesional'); return }
    setGuardando(true)
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, doctorId: form.doctorId,
      tipoCita: form.tipoCita.trim() || 'EVALUACION', duracionMin: Number(form.duracionMin) || 30,
      usaHorarioDoctor: form.usaHorarioDoctor, anticipacionHoras: Number(form.anticipacionHoras) || 0,
      diasMaxFuturo: Number(form.diasMaxFuturo) || 30, mensajeConfirmacion: form.mensajeConfirmacion.trim() || null,
      ...(form.usaHorarioDoctor ? {} : { ventanas }),
    }
    try {
      if (link) await agendaOnlineService.actualizar(link.id, { ...payload, ventanas: form.usaHorarioDoctor ? [] : ventanas })
      else await agendaOnlineService.crear(payload)
      onSaved()
    } catch (e) { onError(e instanceof ApiError ? e.message : 'No se pudo guardar') } finally { setGuardando(false) }
  }

  return (
    <Modal title={link ? 'Editar link de agendamiento' : 'Nuevo link de agendamiento'} onClose={onClose}>
      <div className="space-y-3">
        <Campo label="Nombre del link"><input value={form.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Ej: Evaluaciones Dr. Aedo" className={inp} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Profesional">
            <select value={form.doctorId} onChange={(e) => set({ doctorId: e.target.value })} className={inp}>
              {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo / etiqueta"><input value={form.tipoCita} onChange={(e) => set({ tipoCita: e.target.value })} placeholder="EVALUACION" className={inp} /></Campo>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Campo label="Duración (min)"><input value={form.duracionMin} onChange={(e) => set({ duracionMin: e.target.value })} inputMode="numeric" className={inp} /></Campo>
          <Campo label="Antelación (h)"><input value={form.anticipacionHoras} onChange={(e) => set({ anticipacionHoras: e.target.value })} inputMode="numeric" className={inp} /></Campo>
          <Campo label="Días a futuro"><input value={form.diasMaxFuturo} onChange={(e) => set({ diasMaxFuturo: e.target.value })} inputMode="numeric" className={inp} /></Campo>
        </div>

        <div className="border border-slate-100 rounded-xl p-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.usaHorarioDoctor} onChange={(e) => set({ usaHorarioDoctor: e.target.checked })} />
            Usar el horario del profesional
          </label>
          {!form.usaHorarioDoctor && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">Ventanas exclusivas para este link (solo en estos días/horas se ofrecen cupos):</p>
              {ventanas.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={v.diaSemana} onChange={(e) => setVentanas((vs) => vs.map((x, j) => j === i ? { ...x, diaSemana: Number(e.target.value) } : x))} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                    {DIAS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                  <input type="time" value={v.horaInicio} onChange={(e) => setVentanas((vs) => vs.map((x, j) => j === i ? { ...x, horaInicio: e.target.value } : x))} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  <span className="text-slate-400 text-sm">a</span>
                  <input type="time" value={v.horaFin} onChange={(e) => setVentanas((vs) => vs.map((x, j) => j === i ? { ...x, horaFin: e.target.value } : x))} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  <button onClick={() => setVentanas((vs) => vs.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-600 text-sm">×</button>
                </div>
              ))}
              <button onClick={() => setVentanas((vs) => [...vs, { diaSemana: 1, horaInicio: '09:00', horaFin: '12:00' }])} className="text-xs font-semibold text-cyan-700">+ Agregar ventana</button>
            </div>
          )}
        </div>

        <Campo label="Mensaje de confirmación (opcional)">
          <textarea value={form.mensajeConfirmacion} onChange={(e) => set({ mensajeConfirmacion: e.target.value })} rows={2} placeholder="Ej: ¡Gracias! Te esperamos. Llega 10 min antes." className={inp} />
        </Campo>
      </div>
      <div className="flex gap-2 pt-5">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  )
}

function ReservasModal({ link, onClose }: { link: LinkAgendaDTO; onClose: () => void }) {
  const [reservas, setReservas] = useState<ReservaOnline[] | null>(null)
  useEffect(() => { agendaOnlineService.reservas(link.id).then(setReservas).catch(() => setReservas([])) }, [link.id])
  return (
    <Modal title={`Reservas online · ${link.nombre}`} onClose={onClose}>
      {reservas === null ? <p className="text-sm text-slate-400">Cargando…</p>
        : reservas.length === 0 ? <p className="text-sm text-slate-400">Sin reservas todavía.</p> : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {reservas.map((r) => (
              <div key={r.id} className="py-2.5">
                <p className="text-sm font-medium text-slate-800">{r.paciente.nombre} {r.paciente.apellido}{r.paciente.telefono ? ` · ${r.paciente.telefono}` : ''}</p>
                <p className="text-xs text-slate-500">{fechaHora(r.fecha)} · {r.duracion} min · {r.estado}</p>
                {r.notas && <p className="text-xs text-slate-400 truncate">{r.notas}</p>}
              </div>
            ))}
          </div>
        )}
    </Modal>
  )
}

const inp = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>{children}</label>
}
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
