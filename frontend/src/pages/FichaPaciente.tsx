import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { CitaDTO, DoctorDTO, PacienteDTO, PrestacionDTO, ClinicaConfigDTO } from '@shared/types'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'
import { pacientesService, type FichaClinica, type ResumenPaciente, type ComentarioDTO, type MensajeDTO, type LeadSugerido } from '@/services/clinica.service'
import { planesService, seccionesService, tratamientosService, evolucionesService, historialService, type HistorialEntry } from '@/services/clinico.service'
import { prestacionesService, mediosPagoService, clinicaService, type MedioPagoDTO } from '@/services/catalogo.service'
import { AREA_LABELS, FLAG_POR_AREA, type AreaClinica } from '@shared/constants/areas'

// Profesionales habilitados para un área. Un plan de un área solo lo atiende quien
// tenga esa área activada en su ficha (Super Admin → Equipo). `incluirId` conserva
// al titular ya asignado aunque hoy no tenga el flag (dato antiguo), para no ocultarlo.
function doctoresDeArea(doctores: DoctorDTO[], area: AreaClinica, incluirId?: string): DoctorDTO[] {
  const flag = FLAG_POR_AREA[area]
  return doctores.filter((d) => Boolean(d[flag]) || d.id === incluirId)
}
import { GraficoFacial } from '@/components/GraficoFacial'
import { PresupuestoPlanDoc, type PPlan } from '@/components/PresupuestoPlanDoc'
import { elementoAPdfBase64 } from '@/lib/pdf'
import { cobrosService, cajasService } from '@/services/caja.service'
import { usuariosService } from '@/services/equipo.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { RutField } from '@/components/RutField'
import { validarDoc } from '@shared/constants/paises'
import { fmtMonto, paisMoneda } from '@/lib/money'
import { ConsentimientosPaciente } from '@/components/ConsentimientosPaciente'
import { DocumentosPaciente } from '@/components/DocumentosPaciente'
import { HistorialCorreos } from '@/components/HistorialCorreos'
import { EnviarCorreoModal } from '@/components/EnviarCorreoModal'

const TABS = ['Datos', 'Citas', 'Planes de Tratamiento', 'Recaudación', 'Evoluciones', 'Consentimientos', 'Radiografías y Documentos', 'Correos', 'Historial', 'Comentarios', 'Mensajes'] as const
type Tab = typeof TABS[number]

// Numeración FDI. Permanente: cuadrantes 1/2 (superior) y 4/3 (inferior).
// Temporal (pediátrica): cuadrantes 5/6 (superior) y 8/7 (inferior).
const SUP_PERM = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const INF_PERM = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const SUP_TEMP = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const INF_TEMP = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]
// Zonas (selección independiente, sin marcar dientes): para acciones asociadas
// a una arcada o sextante completo (p.ej. pacientes desdentados). [display, valor].
const SEXTANTES: [string, string][] = [
  ['Sext. 1', 'Sextante 1'], ['Sext. 2', 'Sextante 2'], ['Sext. 3', 'Sextante 3'],
  ['Sext. 4', 'Sextante 4'], ['Sext. 5', 'Sextante 5'], ['Sext. 6', 'Sextante 6'],
]
const fmtCLP = fmtMonto
const hoyISO = () => new Date().toISOString().slice(0, 10)
// Edad en años y meses (ej: "24 años 4 meses"). Sin fecha → "Sin edad ingresada".
function edadTexto(iso: string | null): string {
  if (!iso) return 'Sin edad ingresada'
  const nac = new Date(iso)
  if (Number.isNaN(nac.getTime())) return 'Sin edad ingresada'
  const hoy = new Date()
  let anios = hoy.getFullYear() - nac.getFullYear()
  let meses = hoy.getMonth() - nac.getMonth()
  if (hoy.getDate() < nac.getDate()) meses--
  if (meses < 0) { anios--; meses += 12 }
  if (anios < 0) return 'Sin edad ingresada'
  return `${anios} ${anios === 1 ? 'año' : 'años'} ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

export function FichaPaciente() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // Permite entrar directo a una pestaña vía ?tab= (p.ej. desde la agenda → planes).
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'planes' ? 'Planes de Tratamiento' : 'Datos')
  // Al pinchar la pestaña "Planes de Tratamiento" estando dentro de un plan, se
  // remonta el módulo (cambia el key) para volver a la lista de planes.
  const [planesNonce, setPlanesNonce] = useState(0)
  const [paciente, setPaciente] = useState<PacienteDTO | null>(null)
  const [resumen, setResumen] = useState<ResumenPaciente | null>(null)
  const [ficha, setFicha] = useState<FichaClinica | null>(null)
  const [avisoDeuda, setAvisoDeuda] = useState(false)
  const [leadsSug, setLeadsSug] = useState<LeadSugerido[]>([])
  const [error, setError] = useState('')

  useEffect(() => { pacientesService.obtener(id).then(setPaciente).catch((e) => setError(e.message)) }, [id])
  useEffect(() => { pacientesService.resumen(id).then(setResumen).catch(() => {}) }, [id])
  // Ficha a nivel de página para mostrar las advertencias médicas en el encabezado.
  useEffect(() => { pacientesService.ficha(id).then((f) => setFicha(f.ficha)).catch(() => {}) }, [id])
  // Trazabilidad del embudo: leads sin vincular que coinciden por teléfono/RUT con la ficha.
  useEffect(() => { pacientesService.leadsSugeridos(id).then((r) => setLeadsSug(r.leads)).catch(() => {}) }, [id])
  const vincularLead = async (leadId: string) => {
    try { await pacientesService.vincularLead(id, leadId); setLeadsSug((ls) => ls.filter((l) => l.id !== leadId)) } catch { /* noop */ }
  }

  if (error) return <p className="text-rose-600 text-sm">{error}</p>
  if (!paciente) return <p className="text-slate-500 text-sm">Cargando…</p>

  return (
    <div>
      <Link to="/pacientes" className="text-sm text-cyan-600 hover:underline">← Volver a pacientes</Link>
      <div className="mt-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-4 sm:p-6 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          {/* Izquierda: identidad + KPIs */}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{paciente.nombre} {paciente.apellido}
              {paciente.activo === false && <span className="ml-2 align-middle text-xs font-semibold bg-white/25 rounded-full px-2 py-0.5">Dado de baja</span>}
            </h1>
            <p className="text-cyan-100 text-sm mt-1">
              {paciente.rut ?? 'Sin RUT'} · {edadTexto(paciente.fechaNacimiento)}{paciente.prevision ? ` · ${paciente.prevision}` : ''}
            </p>
            {resumen && (
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 mt-4 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
                <KpiInline l="Tratamientos activos" v={String(resumen.activos)} />
                <KpiInline l="Finalizados" v={String(resumen.finalizados)} />
                <KpiInline l="Realizado" v={fmtCLP(resumen.realizado)} />
                <KpiInline l="Abonado" v={fmtCLP(resumen.abonado)} />
                <KpiInline l="Saldo" v={fmtCLP(resumen.saldo)} destacado={resumen.saldo > 0} />
                {resumen.saldo > 0 && (
                  <button onClick={() => setAvisoDeuda(true)} className="self-center text-xs font-semibold bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1" title="Enviar aviso de deuda por correo">✉ Aviso de deuda</button>
                )}
              </div>
            )}
          </div>
          {/* Derecha: tarjeta de alertas médicas (estilo Dentalink), en rojo. */}
          <AlertasMedicasCard ficha={ficha} />
        </div>
      </div>

      {avisoDeuda && resumen && (
        <EnviarCorreoModal
          tipo="DEUDA" titulo="aviso de deuda"
          asuntoDefault="Estado de cuenta pendiente"
          pacienteId={id} pacienteNombre={`${paciente.nombre} ${paciente.apellido}`} defaultEmail={paciente.email}
          montoPago={resumen.saldo}
          mensajeDefault={`Te recordamos que tienes un saldo pendiente de ${fmtCLP(resumen.saldo)} por tu tratamiento. Puedes pagarlo en línea con el botón de abajo, acercarte a la clínica o responder este correo.`}
          onClose={() => setAvisoDeuda(false)} />
      )}

      {/* Aviso de trazabilidad: leads del CRM sin vincular que coinciden por teléfono/RUT.
          Solo aparece cuando el sistema no pudo vincular solo (varios candidatos / familia). */}
      {leadsSug.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">
            {leadsSug.length === 1 ? 'Hay 1 lead del CRM con este teléfono/RUT sin vincular.' : `Hay ${leadsSug.length} leads del CRM con este teléfono/RUT sin vincular.`}
            <span className="font-normal text-amber-700"> ¿Vincular a esta ficha para no perder la trazabilidad del embudo?</span>
          </p>
          <div className="mt-2 space-y-1.5">
            {leadsSug.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-700 truncate min-w-0">{l.nombre}{l.telefono ? <span className="text-slate-400"> · {l.telefono}</span> : ''} <span className="text-xs text-slate-400">({l.estado})</span></span>
                <button onClick={() => vincularLead(l.id)} className="shrink-0 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg">Vincular</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => { if (t === 'Planes de Tratamiento' && tab === t) setPlanesNonce((n) => n + 1); setTab(t) }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${tab === t ? 'text-cyan-700 border-b-2 border-cyan-600' : 'text-slate-500 hover:text-slate-700'}`}>{t}</button>
        ))}
      </div>

      {/* Las pestañas de contenido tipo formulario/lista se acotan a un ancho
          cómodo de lectura; Planes de Tratamiento usa todo el ancho disponible. */}
      {tab === 'Datos' && <div className="max-w-5xl"><DatosTab paciente={paciente} onSaved={setPaciente} onFichaSaved={setFicha} /></div>}
      {tab === 'Citas' && <div className="max-w-4xl"><CitasTab pacienteId={id} /></div>}
      {tab === 'Planes de Tratamiento' && <PlanesTab key={`${id}:${planesNonce}`} pacienteId={id} pacienteNombre={`${paciente.nombre} ${paciente.apellido}`} pacienteEmail={paciente.email} />}
      {tab === 'Recaudación' && <RecaudacionTab pacienteId={id} />}
      {tab === 'Evoluciones' && <div className="max-w-4xl"><EvolucionesTab pacienteId={id} isAdmin={isAdmin} /></div>}
      {tab === 'Consentimientos' && <div className="max-w-4xl"><ConsentimientosPaciente pacienteId={id} pacienteNombre={`${paciente.nombre} ${paciente.apellido}`} pacienteEmail={paciente.email} /></div>}
      {tab === 'Radiografías y Documentos' && <div className="max-w-5xl"><DocumentosPaciente pacienteId={id} pacienteNombre={`${paciente.nombre} ${paciente.apellido}`} pacienteEmail={paciente.email} /></div>}
      {tab === 'Correos' && <div className="max-w-3xl bg-white rounded-2xl border border-slate-200 p-5"><h3 className="text-sm font-semibold text-slate-800 mb-3">Correos enviados a este paciente</h3><HistorialCorreos pacienteId={id} /></div>}
      {tab === 'Historial' && <div className="max-w-4xl"><HistorialTab pacienteId={id} /></div>}
      {tab === 'Comentarios' && <div className="max-w-4xl"><ComentariosTab pacienteId={id} /></div>}
      {tab === 'Mensajes' && <div className="max-w-4xl"><MensajesTab pacienteId={id} /></div>}
    </div>
  )
}

function KpiInline({ l, v, destacado }: { l: string; v: string; destacado?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-cyan-200/80">{l}</span>
      <span className={`font-semibold ${destacado ? 'text-amber-200' : 'text-white'}`}>{v}</span>
    </span>
  )
}

// Tarjeta de alertas médicas (estilo Dentalink): un cuadro ROJO a la derecha del
// header con lo crítico para procedimientos (anticoagulado, embarazo, condiciones,
// medicamentos y alertas escritas). Si no hay nada relevante, no se muestra.
function AlertasMedicasCard({ ficha }: { ficha: FichaClinica | null }) {
  if (!ficha) return null
  const condiciones = ([
    ['diabetico', 'Diabético'], ['hipertenso', 'Hipertenso'], ['cardiopatia', 'Cardiopatía'], ['fumador', 'Fumador'],
  ] as const).filter(([k]) => ficha[k]).map(([, l]) => l)
  const alertas = (ficha.alertasMedicas ?? '').trim()
  const meds = (ficha.medicamentos ?? '').trim()
  const enfermedades = (ficha.enfermedadesNotas ?? '').trim()
  const hayAlgo = ficha.anticoagulantes || ficha.embarazada || condiciones.length > 0 || alertas || meds || enfermedades
  if (!hayAlgo) return null
  return (
    <div className="shrink-0 lg:w-80 rounded-xl bg-red-600 ring-1 ring-red-300/50 p-3 shadow-sm text-white">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base leading-none">⚠️</span>
        <span className="text-xs font-bold uppercase tracking-wide">Alertas médicas</span>
      </div>
      <ul className="space-y-1 text-[13px] leading-snug">
        {ficha.anticoagulantes && <li className="font-bold">• Paciente anticoagulado — precaución ante sangrado y procedimientos invasivos.</li>}
        {ficha.embarazada && <li className="font-semibold">• Embarazada</li>}
        {condiciones.length > 0 && <li>• {condiciones.join(' · ')}</li>}
        {alertas && <li className="font-semibold">• {alertas}</li>}
        {enfermedades && <li className="text-red-50/95">• {enfermedades}</li>}
        {meds && <li className="text-red-50/95"><span className="font-semibold">Medicamentos:</span> {meds}</li>}
      </ul>
    </div>
  )
}

// ── Comentarios administrativos ──
function ComentariosTab({ pacienteId }: { pacienteId: string }) {
  const [comentarios, setComentarios] = useState<ComentarioDTO[]>([])
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = () => pacientesService.comentarios(pacienteId).then(setComentarios).catch(() => {})
  useEffect(() => { cargar() }, [pacienteId])
  async function agregar() {
    if (!texto.trim()) return
    setGuardando(true)
    try { await pacientesService.agregarComentario(pacienteId, texto.trim()); setTexto(''); cargar() } finally { setGuardando(false) }
  }
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Comentario administrativo (interno)…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={agregar} disabled={guardando || !texto.trim()} className="mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Agregar</button>
      </div>
      <div className="space-y-3">
        {comentarios.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.texto}</p>
            <p className="text-xs text-slate-400 mt-2">{c.autorNombre ?? 'Sistema'} · {new Date(c.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        ))}
        {comentarios.length === 0 && <p className="text-sm text-slate-500">Sin comentarios.</p>}
      </div>
    </div>
  )
}

// ── Historial de mensajes (solo lectura) ──
function MensajesTab({ pacienteId }: { pacienteId: string }) {
  const [mensajes, setMensajes] = useState<MensajeDTO[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => { pacientesService.mensajes(pacienteId).then(setMensajes).finally(() => setCargando(false)) }, [pacienteId])
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (mensajes.length === 0) return <p className="text-slate-500 text-sm">No hay mensajes registrados para este paciente.</p>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {mensajes.map((m) => (
        <div key={m.id} className="px-5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">{m.asunto || m.categoria}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">{m.tipo} · {m.estado}</span>
          </div>
          {m.cuerpo && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{m.cuerpo}</p>}
          <p className="text-xs text-slate-400 mt-1">{m.enviadoA ? `${m.enviadoA} · ` : ''}{new Date(m.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
      ))}
    </div>
  )
}

// ── Datos + ficha clínica ──
function DatosTab({ paciente, onSaved, onFichaSaved }: { paciente: PacienteDTO; onSaved: (p: PacienteDTO) => void; onFichaSaved?: (f: FichaClinica) => void }) {
  const [form, setForm] = useState({
    nombre: paciente.nombre, apellido: paciente.apellido, nombreSocial: paciente.nombreSocial ?? '',
    rut: paciente.rut ?? '', otroDoc: paciente.otroDocId ?? '',
    fechaNacimiento: paciente.fechaNacimiento ? paciente.fechaNacimiento.slice(0, 10) : '',
    sexo: paciente.sexo ?? '', actividad: paciente.actividad ?? '',
    telefono: paciente.telefono ?? '', email: paciente.email ?? '',
    prevision: paciente.prevision ?? '', direccion: paciente.direccion ?? '',
    apoderado: paciente.apoderado ?? '', rutApoderado: paciente.rutApoderado ?? '',
    contactoEmergencia: paciente.contactoEmergencia ?? '', telefonoEmergencia: paciente.telefonoEmergencia ?? '',
    observaciones: paciente.observaciones ?? '',
  })
  const rutInvalido = Boolean(form.rut) && !validarDoc(paisMoneda(), form.rut)
  const [ficha, setFicha] = useState<FichaClinica | null>(null)
  const [flags, setFlags] = useState({
    fumador: false, diabetico: false, hipertenso: false, cardiopatia: false, anticoagulantes: false,
    otras: false, enfermedadesNotas: '',
    motivoAtencion: '', alertasMedicas: '', medicamentos: '', impresionMedica: '', resumenDiagnostico: '',
  })
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()
  const [bajaBusy, setBajaBusy] = useState(false)

  // Dar de baja / reactivar. Los de baja no aparecen en el listado ni en la búsqueda.
  async function toggleActivo() {
    const dando = paciente.activo !== false
    if (dando && !window.confirm(`¿Dar de baja a ${paciente.nombre} ${paciente.apellido}? Quedará oculto del listado y la búsqueda (no se elimina; su historial se conserva). Útil para duplicados.`)) return
    setBajaBusy(true); setMsg('')
    try {
      const p = await pacientesService.actualizar(paciente.id, { activo: !dando })
      if (dando) { navigate('/pacientes') } // ya no aparece en listas; volvemos al listado
      else { onSaved(p); setMsg('Paciente reactivado') }
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado del paciente') } finally { setBajaBusy(false) }
  }

  useEffect(() => {
    pacientesService.ficha(paciente.id).then((f) => {
      setFicha(f.ficha)
      if (f.ficha) setFlags({
        fumador: f.ficha.fumador, diabetico: f.ficha.diabetico, hipertenso: f.ficha.hipertenso, cardiopatia: f.ficha.cardiopatia, anticoagulantes: f.ficha.anticoagulantes,
        otras: !!f.ficha.enfermedadesNotas, enfermedadesNotas: f.ficha.enfermedadesNotas ?? '',
        motivoAtencion: f.ficha.motivoAtencion ?? '', alertasMedicas: f.ficha.alertasMedicas ?? '', medicamentos: f.ficha.medicamentos ?? '',
        impresionMedica: f.ficha.impresionMedica ?? '', resumenDiagnostico: f.ficha.resumenDiagnostico ?? '',
      })
    }).catch(() => {})
  }, [paciente.id])

  async function guardar() {
    if (rutInvalido) { setMsg('Corrige el RUT (dígito verificador) o marca «Otro documento» antes de guardar.'); return }
    setSaving(true); setMsg('')
    try {
      const { otroDoc, ...rest } = form
      const p = await pacientesService.actualizar(paciente.id, { ...rest, otroDocId: otroDoc })
      const { otras, ...fichaData } = flags
      const nuevaFicha = await pacientesService.guardarFicha(paciente.id, { ...fichaData, enfermedadesNotas: otras ? flags.enfermedadesNotas : '' })
      onFichaSaved?.(nuevaFicha)
      onSaved(p)
      setMsg('Cambios guardados')
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error al guardar') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      {/* Barra de guardar superior (sticky) — para no tener que bajar hasta el final. */}
      <div className="sticky top-0 z-10 flex items-center justify-end gap-3 bg-slate-50/90 backdrop-blur -mx-1 px-1 py-2">
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        <button onClick={guardar} disabled={saving || rutInvalido} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-sm">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">N° ficha clínica</span>
          <input value={paciente.numero ?? '—'} readOnly disabled
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-500 font-mono" />
        </label>
        <div className="hidden sm:block" />
        <In label="Nombres" v={form.nombre} on={(x) => setForm({ ...form, nombre: x })} />
        <In label="Apellidos" v={form.apellido} on={(x) => setForm({ ...form, apellido: x })} />
        <In label="Nombre social" v={form.nombreSocial} on={(x) => setForm({ ...form, nombreSocial: x })} />
        <RutField rut={form.rut} otroDoc={form.otroDoc} onChange={(v) => setForm({ ...form, ...v })} />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Fecha de nacimiento</span>
          <input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Sexo</span>
          <select value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Sin especificar</option>
            <option value="Masculino">Masculino</option>
            <option value="Femenino">Femenino</option>
            <option value="Otro">Otro</option>
          </select>
        </label>
        <In label="Ocupación" v={form.actividad} on={(x) => setForm({ ...form, actividad: x })} />
        <In label="Teléfono" v={form.telefono} on={(x) => setForm({ ...form, telefono: x })} />
        <In label="Email" v={form.email} on={(x) => setForm({ ...form, email: x })} />
        <In label="Previsión" v={form.prevision} on={(x) => setForm({ ...form, prevision: x })} />
        <In label="Dirección" v={form.direccion} on={(x) => setForm({ ...form, direccion: x })} />
        <div className="sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Representante legal / Apoderado y contacto de emergencia</p>
        </div>
        <In label="Representante legal o Apoderado" v={form.apoderado} on={(x) => setForm({ ...form, apoderado: x })} />
        <In label="RUT del apoderado / representante" v={form.rutApoderado} on={(x) => setForm({ ...form, rutApoderado: x })} />
        <In label="Contacto de emergencia (nombre)" v={form.contactoEmergencia} on={(x) => setForm({ ...form, contactoEmergencia: x })} />
        <In label="Teléfono de emergencia" v={form.telefonoEmergencia} on={(x) => setForm({ ...form, telefonoEmergencia: x })} />
        <label className="block sm:col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Observaciones</span>
          <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ficha clínica {ficha ? '' : '(sin datos aún)'}</p>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Motivo de atención inicial</span>
          <textarea value={flags.motivoAtencion} onChange={(e) => setFlags({ ...flags, motivoAtencion: e.target.value })} rows={2}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-2">Condiciones</span>
          <div className="flex flex-wrap gap-4">
            {([['fumador', 'Fumador'], ['diabetico', 'Diabético'], ['hipertenso', 'Hipertenso'], ['cardiopatia', 'Cardiopatía'], ['anticoagulantes', 'Anticoagulantes']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} /> {l}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={flags.otras} onChange={(e) => setFlags({ ...flags, otras: e.target.checked, enfermedadesNotas: e.target.checked ? flags.enfermedadesNotas : '' })} /> Otras
            </label>
          </div>
          {flags.otras && (
            <input value={flags.enfermedadesNotas} onChange={(e) => setFlags({ ...flags, enfermedadesNotas: e.target.value })}
              placeholder="¿Cuáles? Especificar otras condiciones"
              className="mt-2 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          )}
        </div>

        <In label="Alertas médicas" v={flags.alertasMedicas} on={(x) => setFlags({ ...flags, alertasMedicas: x })} />
        <In label="Medicamentos" v={flags.medicamentos} on={(x) => setFlags({ ...flags, medicamentos: x })} />

        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Impresión médica general</span>
          <textarea value={flags.impresionMedica} onChange={(e) => setFlags({ ...flags, impresionMedica: e.target.value })} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Resumen diagnóstico integral</span>
          <textarea value={flags.resumenDiagnostico} onChange={(e) => setFlags({ ...flags, resumenDiagnostico: e.target.value })} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={guardar} disabled={saving || rutInvalido} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : 'Guardar'}</button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {isAdmin && (
          paciente.activo === false ? (
            <button onClick={toggleActivo} disabled={bajaBusy} className="ml-auto px-4 py-2.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 text-sm font-semibold rounded-xl">{bajaBusy ? '…' : 'Reactivar paciente'}</button>
          ) : (
            <button onClick={toggleActivo} disabled={bajaBusy} className="ml-auto px-4 py-2.5 border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-60 text-sm font-semibold rounded-xl">{bajaBusy ? '…' : 'Dar de baja'}</button>
          )
        )}
      </div>
    </div>
  )
}

// ── Citas del paciente ──
function CitasTab({ pacienteId }: { pacienteId: string }) {
  const [citas, setCitas] = useState<CitaDTO[]>([])
  const [cargando, setCargando] = useState(true)
  // Ordenadas de la más reciente a la más antigua (por fecha de inicio).
  useEffect(() => { pacientesService.citas(pacienteId).then((cs) => setCitas([...cs].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()))).finally(() => setCargando(false)) }, [pacienteId])
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (citas.length === 0) return <p className="text-slate-500 text-sm">Este paciente no tiene citas.</p>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {citas.map((c) => {
        const cfg = CITA_ESTADOS[c.estado]
        return (
          <div key={c.id} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{new Date(c.inicio).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-xs text-slate-500">{c.doctor} · {c.tipo}</p>
              {c.notas?.trim() && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">💬 {c.notas.trim()}</p>}
            </div>
            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>{cfg?.label ?? c.estado}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Planes de tratamiento (estilo Dentalink) ──
interface CobroItemLite { monto: number; cobro: { estado: string } | null }
interface EvolucionLite { id: string; fecha: string; texto: string; autor: { id: string; name: string | null; email: string | null } | null }
interface TratNode {
  id: string; estado: string; precio: number; descuento: number; diente: number | null; cara: string | null; notas: string | null
  paraCobro?: boolean; fechaCompletado?: string | null
  prestacion: { nombre: string; categoria: string | null }; cobroItems: CobroItemLite[]
  doctor: { id: string; name: string | null } | null
  evoluciones?: EvolucionLite[]
  zonas?: { zona: { codigo: string; nombreVisible: string } }[] // área estética
  _count?: { liquidacionItems: number }
}
interface TratLite { estado: string; precio: number; descuento: number; cobroItems: CobroItemLite[] }
interface SeccionNode { id: string; titulo: string; orden: number; fechaTentativa: string | null; diasDesdeAnterior: number | null; tiempoUnidad?: string; tratamientos: TratNode[] }
// Etiqueta del tiempo estimado según su unidad (días/semanas/meses).
function labelTiempoEstimado(cant: number, unidad?: string): string {
  const u = unidad === 'MESES' ? 'meses' : unidad === 'SEMANAS' ? 'semanas' : 'días'
  return `~${cant} ${u} estimados`
}
interface DoctorRef { id: string; name: string | null; email?: string | null }
interface PlanCard {
  id: string; nombre: string; estado: string; bloqueado?: boolean; area?: AreaClinica
  doctorTitular: DoctorRef | null; createdAt: string; updatedAt: string; fechaInicio: string | null
  _count?: { tratamientos: number; secciones: number }; tratamientos: TratLite[]; abonoLibre?: number
}
interface PlanDetalle {
  id: string; nombre: string; estado: string; bloqueado: boolean; area?: AreaClinica
  doctorTitularId: string | null; doctorTitular: DoctorRef | null
  secciones: SeccionNode[]; tratamientos: TratNode[]; abonoLibre?: number
}

const netoTrat = (t: { precio: number; descuento: number }) => Math.round(t.precio * (1 - (t.descuento || 0) / 100))
const pagadoTrat = (t: { cobroItems: CobroItemLite[] }) => t.cobroItems.filter((ci) => ci.cobro?.estado === 'PAGADO').reduce((s, ci) => s + ci.monto, 0)
const pagadaTrat = (t: TratNode) => netoTrat(t) > 0 && pagadoTrat(t) >= netoTrat(t) - 0.5
const planFinanzas = (trats: TratLite[]) => {
  const total = trats.reduce((s, t) => s + netoTrat(t), 0)
  const realizado = trats.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + netoTrat(t), 0)
  const abonado = trats.reduce((s, t) => s + pagadoTrat(t), 0)
  const hechas = trats.filter((t) => t.estado === 'COMPLETADO').length
  return { total, realizado, abonado, saldo: Math.max(0, total - abonado), progreso: trats.length ? Math.round((hechas / trats.length) * 100) : 0, hechas, n: trats.length }
}

// Estado financiero del plan, comparando lo REALIZADO (acciones evolucionadas)
// con lo ABONADO (pagos de acciones + abono libre):
//  · Sin comenzar  → nada realizado y nada abonado.
//  · Hay saldo     → abonado > realizado (dinero a favor, sin acciones realizadas o de más).
//  · Al día        → todo lo realizado está pagado (sin deuda ni saldo a favor).
//  · Deuda         → hay acciones realizadas sin pagar (realizado > abonado).
function estadoFinanciero(realizado: number, abonado: number): { label: string; cls: string; icon: string } {
  const r = Math.round(realizado)
  const a = Math.round(abonado)
  if (r > a) return { label: 'Deuda', cls: 'text-rose-600', icon: '●' }
  if (a > r) return { label: 'Hay saldo', cls: 'text-cyan-600', icon: '●' }
  if (r > 0) return { label: 'Al día', cls: 'text-emerald-600', icon: '✓' }
  return { label: 'Sin comenzar', cls: 'text-slate-400', icon: '○' }
}

function PlanesTab({ pacienteId, pacienteNombre, pacienteEmail }: { pacienteId: string; pacienteNombre: string; pacienteEmail?: string | null }) {
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [enviarPlan, setEnviarPlan] = useState<PlanCard | null>(null)
  // Documento de presupuesto (fuera de pantalla) para adjuntar el PDF al correo.
  const [pdfDoc, setPdfDoc] = useState<{ plan: PPlan; clinica: ClinicaConfigDTO; paciente: PacienteDTO | null } | null>(null)
  const pdfRef = useRef<HTMLDivElement>(null)
  const [prestaciones, setPrestaciones] = useState<PrestacionDTO[]>([])
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [selPiezas, setSelPiezas] = useState<number[]>([])
  const [selCaras, setSelCaras] = useState<Record<number, string[]>>({})
  // Zonas (arcadas/sextantes): selección MÚLTIPLE, igual que las piezas — se puede
  // marcar arcada superior E inferior a la vez.
  const [selZonas, setSelZonas] = useState<string[]>([])
  // Área activa del plan (pestañas solo si el profesional tiene más de una) y
  // zonas FACIALES seleccionadas (capa 1 del gráfico facial → alimentan la acción).
  const [areaPlan, setAreaPlan] = useState<AreaClinica | ''>('')
  const [selZonasFax, setSelZonasFax] = useState<Set<string>>(new Set())
  const [denticion, setDenticion] = useState<'PERM' | 'TEMP'>('PERM')
  const [evoAccion, setEvoAccion] = useState<TratNode | null>(null)
  const [nuevoPlanOpen, setNuevoPlanOpen] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  // Al imprimir/enviar un presupuesto queda bloqueado; sólo puede reabrirlo un
  // admin o quien tenga el permiso "desbloquear presupuestos".
  const puedeDesbloquear = user?.role === 'admin' || Boolean(user?.permisos?.puedeDesbloquearPlanes)
  const areasUsuario = useMemo(() => (user?.areas ?? []) as AreaClinica[], [user?.areas])
  useEffect(() => { if (!areaPlan && areasUsuario.length > 0) setAreaPlan(areasUsuario[0]) }, [areasUsuario, areaPlan])
  // El área activa la fija el PLAN abierto (un plan = un área). Así el diagrama y el
  // catálogo del detalle son SOLO los de esa área.
  useEffect(() => { if (detalle?.area) setAreaPlan(detalle.area) }, [detalle?.area])

  const cargarPlanes = () => planesService.listar(pacienteId).then((p) => setPlanes(p as PlanCard[])).catch(() => {})
  useEffect(() => {
    cargarPlanes()
    usuariosService.doctores().then(setDoctores).catch(() => {})
  }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps
  // El selector de prestaciones del plan trae SOLO las del área activa.
  useEffect(() => {
    if (!areaPlan) return
    prestacionesService.listar(areaPlan).then((ps) => setPrestaciones(ps.filter((p) => p.activo))).catch(() => {})
  }, [areaPlan])

  // Al abrir el envío por correo, prepara el presupuesto completo (fuera de
  // pantalla) para poder adjuntarlo en PDF de forma confiable.
  useEffect(() => {
    if (!enviarPlan) { setPdfDoc(null); return }
    let vivo = true
    Promise.all([
      planesService.obtener(enviarPlan.id),
      clinicaService.obtener(),
      pacientesService.obtener(pacienteId).catch(() => null),
    ]).then(([plan, clinica, paciente]) => {
      if (vivo) setPdfDoc({ plan: plan as PPlan, clinica, paciente })
    }).catch(() => {})
    return () => { vivo = false }
  }, [enviarPlan, pacienteId])

  const abrir = async (planId: string) => { try { clearSel(); setDetalle(await planesService.obtener(planId) as PlanDetalle) } catch (e) { setError((e as Error).message) } }
  // Recarga los datos del plan CONSERVANDO la selección del odontograma (para poder
  // cargar varias acciones a las mismas piezas sin volver a marcarlas). Solo `abrir`
  // (elegir otro plan) o "Limpiar selección" borran la selección.
  const recargar = async () => { if (detalle) { try { setDetalle(await planesService.obtener(detalle.id) as PlanDetalle) } catch (e) { setError((e as Error).message) } } }
  // Selección múltiple en el odontograma: se pueden marcar varias piezas y, en
  // cada una, sus caras. Clic en una cara agrega esa pieza+cara; clic en la
  // silueta/número selecciona/deselecciona la pieza completa (implante).
  const clearSel = () => { setSelPiezas([]); setSelCaras({}); setSelZonas([]); setSelZonasFax(new Set()) }
  const toggleFace = (n: number, f: string) => {
    setSelZonas([]); setSelZonasFax(new Set())
    setSelPiezas((ps) => (ps.includes(n) ? ps : [...ps, n]))
    setSelCaras((cs) => {
      const cur = cs[n] ?? []
      return { ...cs, [n]: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] }
    })
  }
  const toggleWhole = (n: number) => {
    setSelZonas([]); setSelZonasFax(new Set())
    setSelPiezas((ps) => (ps.includes(n) ? ps.filter((x) => x !== n) : [...ps, n]))
    setSelCaras((cs) => { const { [n]: _omit, ...rest } = cs; return rest })
  }
  // Zona = selección independiente (no marca dientes). Excluye la selección de
  // piezas, pero permite VARIAS zonas a la vez (arcada superior + inferior, etc.).
  const toggleZona = (label: string) => {
    setSelPiezas([]); setSelCaras({}); setSelZonasFax(new Set())
    setSelZonas((zs) => (zs.includes(label) ? zs.filter((x) => x !== label) : [...zs, label]))
  }
  const cambiarDenticion = (d: 'PERM' | 'TEMP') => { setDenticion(d); clearSel() }
  // Zonas faciales (estética): selección múltiple; excluye piezas/zonas dentales.
  const toggleZonaFax = (zonaId: string) => {
    setSelPiezas([]); setSelCaras({}); setSelZonas([])
    setSelZonasFax((zs) => { const n = new Set(zs); if (n.has(zonaId)) n.delete(zonaId); else n.add(zonaId); return n })
  }
  // El profesional a cargo se elige al crear el plan (NuevoPlanModal). Antes caía
  // por defecto al primer doctor de la lista, dejando todos los planes con el mismo.
  async function crearPlan(doctorTitularId: string, area: AreaClinica) {
    const p = await planesService.crear({ pacienteId, doctorTitularId: doctorTitularId || undefined, area }) as { id: string }
    setNuevoPlanOpen(false); cargarPlanes(); abrir(p.id)
  }

  async function accion<T>(fn: () => Promise<T>) {
    setError('')
    try { await fn(); recargar(); cargarPlanes() } catch (e) { setError(e instanceof ApiError ? e.message : 'Error') }
  }
  const finalizar = (id: string) => accion(() => planesService.actualizar(id, { estado: 'FINALIZADO' }))
  const reabrir = (id: string) => accion(() => planesService.actualizar(id, { estado: 'ACTIVO' }))

  // Tras evolucionar una acción: si quedó completada la ÚLTIMA acción pendiente del
  // plan, se consulta si finalizarlo. Se relee el plan para evaluar sobre datos frescos.
  async function trasEvolucionar() {
    setEvoAccion(null)
    cargarPlanes()
    if (!detalle) return
    let fresh: PlanDetalle
    try { fresh = await planesService.obtener(detalle.id) as PlanDetalle } catch { recargar(); return }
    setDetalle(fresh)
    const acc = [...fresh.secciones.flatMap((s) => s.tratamientos), ...fresh.tratamientos]
    const todasHechas = acc.length > 0 && acc.every((t) => t.estado === 'COMPLETADO')
    if (todasHechas && fresh.estado !== 'FINALIZADO') {
      if (window.confirm('Se completó la última acción de este plan de tratamiento. ¿Deseas finalizarlo? Podrás verlo luego en la pestaña "Finalizados".')) {
        await finalizar(fresh.id)
      }
    }
  }
  async function eliminarPlan(id: string) {
    if (!window.confirm('¿Eliminar este plan? Las acciones ya realizadas quedan registradas en la ficha del paciente.')) return
    await accion(() => planesService.eliminar(id))
    if (detalle?.id === id) setDetalle(null)
  }
  function renombrar() {
    if (!detalle) return
    const nombre = window.prompt('Nombre del plan de tratamiento', detalle.nombre)
    if (nombre && nombre.trim()) accion(() => planesService.actualizar(detalle.id, { nombre: nombre.trim() }))
  }

  return (
    <div>
      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {detalle ? (
        <PlanDetalleView
          plan={detalle} prestaciones={prestaciones} doctores={doctores} pacienteId={pacienteId}
          areaPlan={(detalle.area || 'DENTAL') as AreaClinica}
          selZonasFax={selZonasFax} toggleZonaFax={toggleZonaFax}
          selPiezas={selPiezas} selCaras={selCaras} selZonas={selZonas} denticion={denticion}
          toggleFace={toggleFace} toggleWhole={toggleWhole} toggleZona={toggleZona} clearSel={clearSel} cambiarDenticion={cambiarDenticion}
          accion={accion}
          onCerrar={() => setDetalle(null)} onEvolucionar={setEvoAccion} onRenombrar={renombrar}
          onFinalizar={() => finalizar(detalle.id)} onReabrir={() => reabrir(detalle.id)}
          puedeDesbloquear={puedeDesbloquear}
          onBloquear={() => {
            if (detalle.bloqueado && !puedeDesbloquear) { setError('No tienes permiso para desbloquear presupuestos. Pídeselo a un administrador.'); return }
            accion(() => planesService.actualizar(detalle.id, { bloqueado: !detalle.bloqueado }))
          }}
          onProfesional={(id) => accion(() => planesService.actualizar(detalle.id, { doctorTitularId: id || null }))}
          onEnviarCorreo={() => setEnviarPlan({
            id: detalle.id, nombre: detalle.nombre, estado: detalle.estado, bloqueado: detalle.bloqueado,
            doctorTitular: detalle.doctorTitular, createdAt: '', updatedAt: '', fechaInicio: null,
            tratamientos: [...detalle.secciones.flatMap((s) => s.tratamientos), ...detalle.tratamientos], abonoLibre: detalle.abonoLibre,
          })}
        />
      ) : (
        <PlanLista planes={planes} onAbrir={abrir} onNuevo={() => setNuevoPlanOpen(true)} onEliminar={eliminarPlan} onEnviar={setEnviarPlan} />
      )}
      {enviarPlan && (() => { const fin = planFinanzas(enviarPlan.tratamientos); const saldo = Math.max(0, fin.total - (fin.abonado + (enviarPlan.abonoLibre ?? 0))); return (
        <EnviarCorreoModal
          tipo="PLAN" titulo="presupuesto"
          asuntoDefault={`Presupuesto · ${enviarPlan.nombre}`}
          pacienteId={pacienteId} pacienteNombre={pacienteNombre} defaultEmail={pacienteEmail}
          mensajeDefault={`Te compartimos el presupuesto de tu plan de tratamiento "${enviarPlan.nombre}". Total: ${fmtMonto(fin.total)} · Abonado: ${fmtMonto(fin.abonado + (enviarPlan.abonoLibre ?? 0))} · Saldo por abonar: ${fmtMonto(saldo)}. El detalle va adjunto en PDF.`}
          generarPdf={async () => {
            if (!pdfDoc || !pdfRef.current) throw new Error('El presupuesto se está preparando, espera un segundo e inténtalo de nuevo.')
            return { base64: await elementoAPdfBase64(pdfRef.current), nombre: `Presupuesto ${enviarPlan.nombre}.pdf` }
          }}
          onSent={() => {
            // Enviado por correo → el presupuesto queda bloqueado automáticamente.
            planesService.actualizar(enviarPlan.id, { bloqueado: true }).then(() => { cargarPlanes(); if (detalle?.id === enviarPlan.id) abrir(enviarPlan.id) }).catch(() => {})
          }}
          onClose={() => setEnviarPlan(null)} />
      ) })()}
      {/* Presupuesto renderizado fuera de pantalla (ancho carta) para generar el PDF adjunto. */}
      {pdfDoc && (
        <div style={{ position: 'absolute', left: -10000, top: 0, width: 816 }} aria-hidden>
          <div ref={pdfRef} style={{ padding: 24, background: '#fff' }}>
            <PresupuestoPlanDoc plan={pdfDoc.plan} clinica={pdfDoc.clinica} paciente={pdfDoc.paciente} />
          </div>
        </div>
      )}
      {evoAccion && detalle && (
        <EvolucionModal accion={evoAccion} pacienteNombre={pacienteNombre} doctores={doctores} plan={detalle}
          onClose={() => setEvoAccion(null)}
          onDone={trasEvolucionar} />
      )}
      {nuevoPlanOpen && (
        <NuevoPlanModal doctores={doctores} areasUsuario={areasUsuario} onClose={() => setNuevoPlanOpen(false)} onCrear={crearPlan} />
      )}
    </div>
  )
}

// Al crear un plan se pregunta el profesional a cargo (antes caía por defecto al
// primer doctor). Queda asignado desde el inicio; se puede cambiar luego en el detalle.
function NuevoPlanModal({ doctores, areasUsuario, onClose, onCrear }: {
  doctores: DoctorDTO[]; areasUsuario: AreaClinica[]; onClose: () => void; onCrear: (doctorTitularId: string, area: AreaClinica) => Promise<void>
}) {
  const [doctorId, setDoctorId] = useState('')
  // Un plan pertenece a un área. Si el profesional trabaja más de un área, la elige;
  // si trabaja una sola, se asigna sola (sin preguntar).
  const [area, setArea] = useState<AreaClinica>(areasUsuario[0] ?? 'DENTAL')
  const [creando, setCreando] = useState(false)
  const [err, setErr] = useState('')

  // Solo los profesionales habilitados para el área elegida pueden quedar a cargo.
  const docs = useMemo(() => doctoresDeArea(doctores, area), [doctores, area])
  // Si al cambiar de área el profesional elegido ya no aplica, se deselecciona.
  useEffect(() => { if (doctorId && !docs.some((d) => d.id === doctorId)) setDoctorId('') }, [docs, doctorId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function crear() {
    if (!doctorId) { setErr('Selecciona el profesional a cargo del plan'); return }
    setCreando(true); setErr('')
    try { await onCrear(doctorId, area) } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo crear el plan'); setCreando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Nuevo plan de tratamiento</h3>
          <p className="text-sm text-slate-500">{areasUsuario.length > 1 ? 'Elegí el área y el profesional a cargo.' : '¿Qué profesional queda a cargo de este plan?'}</p>
        </div>
        <div className="p-5 space-y-3">
          {areasUsuario.length > 1 && (
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Área del plan</span>
              <div className="mt-1 flex gap-2">
                {areasUsuario.map((a) => (
                  <button key={a} type="button" onClick={() => setArea(a)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${area === a ? 'border-cyan-600 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {AREA_LABELS[a]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">El plan solo admitirá acciones de esta área. No se puede cambiar después.</p>
            </label>
          )}
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Profesional a cargo</span>
            <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setErr('') }} autoFocus
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option value="">Selecciona un profesional…</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
            </select>
            {docs.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                Ningún profesional tiene habilitada el área {AREA_LABELS[area]}. Actívala en su ficha (Equipo) para poder crear el plan.
              </p>
            )}
          </label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
          <button onClick={crear} disabled={creando || !doctorId} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">{creando ? 'Creando…' : 'Crear plan'}</button>
        </div>
      </div>
    </div>
  )
}

function ProgresoRing({ pct }: { pct: number }) {
  const r = 15, c = 2 * Math.PI * r
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" className="shrink-0">
      <circle cx="21" cy="21" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle cx="21" cy="21" r={r} fill="none" stroke="#0891b2" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 21 21)" />
      <text x="21" y="21" textAnchor="middle" dominantBaseline="central" fontSize="10" className="fill-slate-600 font-semibold">{pct}%</text>
    </svg>
  )
}

function Linea({ l, v, destacado }: { l: string; v: string; destacado?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-slate-500">{l}</span>
      <span className={`font-mono font-semibold ${destacado ? 'text-amber-600' : 'text-slate-800'}`}>{v}</span>
    </div>
  )
}

function Campo({ l, v }: { l: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p>
      <p className="text-sm text-slate-700 truncate">{v}</p>
    </div>
  )
}

function PlanTarjeta({ p, onAbrir, onEliminar, onEnviar }: { p: PlanCard; onAbrir: (id: string) => void; onEliminar: (id: string) => void; onEnviar: (p: PlanCard) => void }) {
  const fin = planFinanzas(p.tratamientos)
  const ef = estadoFinanciero(fin.realizado, fin.abonado + (p.abonoLibre ?? 0))
  return (
    <div onClick={() => onAbrir(p.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onAbrir(p.id) }}
      className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-cyan-400 hover:shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-cyan-700 font-semibold truncate min-w-0">#{p.id.slice(-4)}: {p.nombre}</span>
        <div className="flex items-center gap-2 shrink-0">
          {p.area && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{AREA_LABELS[p.area]}</span>}
          <button onClick={(e) => { e.stopPropagation(); onEnviar(p) }} className="text-cyan-600 hover:text-cyan-800" title="Enviar plan por correo">✉</button>
          <button onClick={(e) => { e.stopPropagation(); onEliminar(p.id) }} className="text-slate-300 hover:text-rose-600" title="Eliminar plan">🗑</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 items-center">
        <Campo l="Profesional" v={p.doctorTitular?.name ?? '—'} />
        <Campo l="Acciones" v={`${fin.hechas}/${fin.n}`} />
        <div className="flex items-center gap-2"><ProgresoRing pct={fin.progreso} /><span className="text-[11px] uppercase tracking-wide text-slate-400">Progreso</span></div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Estado financiero</p>
          <p className={`text-sm font-semibold ${ef.cls}`}>{ef.icon} {ef.label}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3 border-t border-slate-100 pt-2">
        Creado: {new Date(p.createdAt).toLocaleDateString('es-CL', { dateStyle: 'long' })} · Última actividad: {new Date(p.updatedAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </div>
  )
}

function PlanLista({ planes, onAbrir, onNuevo, onEliminar, onEnviar }: {
  planes: PlanCard[]; onAbrir: (id: string) => void; onNuevo: () => void; onEliminar: (id: string) => void; onEnviar: (p: PlanCard) => void
}) {
  const [tab, setTab] = useState<'ejecucion' | 'finalizados'>('ejecucion')
  const enEjecucion = planes.filter((p) => p.estado !== 'FINALIZADO')
  const finalizados = planes.filter((p) => p.estado === 'FINALIZADO')
  const lista = tab === 'finalizados' ? finalizados : enEjecucion
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-900">Planes de tratamiento</h2>
        <button onClick={onNuevo} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl whitespace-nowrap">+ Nuevo plan de tratamiento</button>
      </div>
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        <button onClick={() => setTab('ejecucion')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === 'ejecucion' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>En ejecución{enEjecucion.length ? ` (${enEjecucion.length})` : ''}</button>
        <button onClick={() => setTab('finalizados')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === 'finalizados' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Finalizados{finalizados.length ? ` (${finalizados.length})` : ''}</button>
      </div>
      {planes.length === 0
        ? <p className="text-sm text-slate-500">Este paciente no tiene planes de tratamiento.</p>
        : lista.length === 0
          ? <p className="text-sm text-slate-500">{tab === 'finalizados' ? 'No hay planes finalizados.' : 'No hay planes en ejecución.'}</p>
          : <div className="space-y-3">{lista.map((p) => <PlanTarjeta key={p.id} p={p} onAbrir={onAbrir} onEliminar={onEliminar} onEnviar={onEnviar} />)}</div>}
    </div>
  )
}

function PlanDetalleView({ plan, prestaciones, doctores, pacienteId, areaPlan, selZonasFax, toggleZonaFax, selPiezas, selCaras, selZonas, denticion, toggleFace, toggleWhole, toggleZona, clearSel, cambiarDenticion, accion, onCerrar, onEvolucionar, onRenombrar, onFinalizar, onReabrir, onBloquear, onProfesional, onEnviarCorreo, puedeDesbloquear }: {
  plan: PlanDetalle; prestaciones: PrestacionDTO[]; doctores: DoctorDTO[]; pacienteId: string
  areaPlan: AreaClinica
  selZonasFax: Set<string>; toggleZonaFax: (zonaId: string) => void
  selPiezas: number[]; selCaras: Record<number, string[]>; selZonas: string[]; denticion: 'PERM' | 'TEMP'
  toggleFace: (n: number, f: string) => void; toggleWhole: (n: number) => void; toggleZona: (label: string) => void
  clearSel: () => void; cambiarDenticion: (d: 'PERM' | 'TEMP') => void
  accion: (fn: () => Promise<unknown>) => Promise<void>
  onCerrar: () => void; onEvolucionar: (t: TratNode) => void; onRenombrar: () => void
  onFinalizar: () => void; onReabrir: () => void
  onBloquear: () => void; onProfesional: (id: string) => void; onEnviarCorreo: () => void; puedeDesbloquear: boolean
}) {
  const finalizado = plan.estado === 'FINALIZADO'
  const [drawerOpen, setDrawerOpen] = useState(false)
  const selCount = selPiezas.length + selZonas.length + selZonasFax.size // qué hay marcado para asociar
  // Panel lateral de prestaciones: se abre al seleccionar una pieza/zona (o con
  // "+ Prestación") y se cierra solo al quedar sin selección — sin bloquear el
  // diagrama, así se pueden seguir marcando/desmarcando dientes con el panel abierto.
  const prevSel = useRef(0)
  useEffect(() => {
    if (selCount > 0 && !plan.bloqueado) setDrawerOpen(true)
    else if (selCount === 0 && prevSel.current > 0) setDrawerOpen(false)
    prevSel.current = selCount
  }, [selCount, plan.bloqueado])
  const todas = [...plan.secciones.flatMap((s) => s.tratamientos), ...plan.tratamientos]
  const fin = planFinanzas(todas)
  const abonado = fin.abonado + (plan.abonoLibre ?? 0)
  const saldo = Math.max(0, fin.total - abonado)
  // Deuda = lo REALIZADO que aún no está cubierto por pagos ni abono libre.
  const deuda = Math.max(0, fin.realizado - abonado)
  // Caras que ya tienen una acción, por pieza (para resaltarlas en el odontograma).
  const caraMap = new Map<number, Set<string>>()
  for (const t of todas) {
    if (t.diente == null) continue
    const set = caraMap.get(t.diente) ?? new Set<string>()
    for (const f of (t.cara ?? '').split('')) if (f.trim()) set.add(f)
    caraMap.set(t.diente, set)
  }
  // Reordenar secciones: reasigna `orden` = posición tras el intercambio.
  async function moverSeccion(idx: number, dir: -1 | 1) {
    const arr = [...plan.secciones]
    const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    await accion(() => Promise.all(arr.map((s, i) => seccionesService.actualizar(s.id, { orden: i }))))
  }
  // Mover una acción (arrastrar) a otra sección. seccionId '' = sin sección.
  const moverAccion = (tratId: string, seccionId: string) => accion(() => tratamientosService.actualizar(tratId, { seccionId: seccionId || null }))
  return (
    <div>
      <button onClick={onCerrar} className="text-sm text-cyan-600 hover:underline mb-3">← Planes de tratamiento</button>
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* Panel izquierdo: presupuesto + datos */}
        <div className="space-y-3 min-w-0">
          <div className="rounded-2xl bg-gradient-to-br from-cyan-600 to-cyan-700 text-white p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs text-cyan-100">Plan de tratamiento #{plan.id.slice(-4)}</p>
              {finalizado && <span className="text-[10px] font-semibold bg-white/25 rounded-full px-2 py-0.5">Finalizado</span>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h3 className="text-lg font-bold truncate">{plan.nombre}</h3>
              <button onClick={onRenombrar} title="Renombrar" className="text-cyan-100 hover:text-white shrink-0">✏️</button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-center text-[11px] uppercase tracking-wide text-slate-400">Presupuesto total</p>
            <p className="text-center text-2xl font-bold text-cyan-700 mb-3">{fmtCLP(fin.total)}</p>
            {/* Deuda destacada: lo realizado impago. Bien visible arriba del resumen. */}
            {deuda > 0 && (
              <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-wide text-rose-500 font-semibold">Deuda (realizado impago)</p>
                <p className="text-xl font-bold text-rose-600 font-mono">{fmtCLP(deuda)}</p>
              </div>
            )}
            <Linea l="Realizado" v={fmtCLP(fin.realizado)} />
            <Linea l="Abonado" v={fmtCLP(abonado)} />
            <Linea l="Saldo por abonar" v={fmtCLP(saldo)} destacado={saldo > 0} />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Profesional a cargo</span>
              <select value={plan.doctorTitularId ?? ''} onChange={(e) => onProfesional(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                <option value="">Sin asignar</option>
                {doctoresDeArea(doctores, areaPlan, plan.doctorTitularId ?? undefined).map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
              </select>
            </label>
            <button onClick={onBloquear} disabled={plan.bloqueado && !puedeDesbloquear}
              title={plan.bloqueado && !puedeDesbloquear ? 'Presupuesto bloqueado. Sólo un administrador o alguien con permiso puede desbloquearlo.' : ''}
              className={`w-full text-xs font-semibold px-3 py-2 rounded-lg border disabled:cursor-not-allowed ${plan.bloqueado ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {plan.bloqueado ? (puedeDesbloquear ? '🔒 Presupuesto bloqueado · Desbloquear' : '🔒 Presupuesto bloqueado') : '🔓 Bloquear presupuesto'}
            </button>
            {/* Imprimir/enviar bloquea el presupuesto automáticamente (evita editarlo tras entregarlo). */}
            <button onClick={() => { window.open(`/print/plan/${plan.id}`, '_blank'); if (!plan.bloqueado) accion(() => planesService.actualizar(plan.id, { bloqueado: true })) }}
              className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
              🖨 Imprimir presupuesto (PDF)
            </button>
            <button onClick={onEnviarCorreo}
              className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
              ✉ Enviar presupuesto por correo (PDF)
            </button>
            {!plan.bloqueado && <p className="text-[11px] text-slate-400 leading-tight">Al imprimir o enviar, el presupuesto queda bloqueado para no modificarlo.</p>}
            {finalizado ? (
              <button onClick={() => { if (window.confirm('¿Reabrir este plan? Volverá a "En ejecución".')) onReabrir() }}
                className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">↩ Reabrir plan</button>
            ) : (
              <button onClick={() => { if (window.confirm('¿Finalizar este plan de tratamiento? Pasará a la pestaña "Finalizados".')) onFinalizar() }}
                className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">✓ Finalizar plan de tratamiento</button>
            )}
          </div>
        </div>

        {/* Panel derecho: el plan es de UN área (badge). Dental → odontograma;
            Estética → gráfico facial (2 capas); Médico → sin diagrama (solo catálogo). */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Área del plan</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-700">{AREA_LABELS[areaPlan]}</span>
          </div>
          {areaPlan === 'DENTAL' && (
            <div id="plan-diagrama" className="bg-white rounded-2xl border border-slate-200 p-4 scroll-mt-2">
              <OdontogramaPlan caraMap={caraMap} selPiezas={selPiezas} selCaras={selCaras} selZonas={selZonas} denticion={denticion}
                onFace={toggleFace} onWhole={toggleWhole} onZona={toggleZona} onClear={clearSel} onDenticion={cambiarDenticion} />
            </div>
          )}
          {areaPlan === 'ESTETICA' && (
            <div id="plan-diagrama" className="bg-white rounded-2xl border border-slate-200 p-4 scroll-mt-2">
              <GraficoFacial pacienteId={pacienteId} selZonas={selZonasFax} onToggleZona={toggleZonaFax} />
            </div>
          )}

          {plan.bloqueado ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Plan bloqueado: no se puede editar el presupuesto (agregar/quitar acciones, precios). Las acciones igual se pueden evolucionar. Desbloquéalo para editar.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <AgregarSeccion planId={plan.id} accion={accion} sinSeccionIds={plan.tratamientos.map((t) => t.id)} />
                <button onClick={() => setDrawerOpen(true)}
                  className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
                  + Prestación
                </button>
                {selCount > 0 ? (
                  <span className="text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-full px-2 py-0.5">{selCount} seleccionada{selCount > 1 ? 's' : ''}</span>
                ) : (
                  <span className="text-xs text-slate-400">{areaPlan === 'DENTAL' ? 'Seleccioná piezas o una zona; o tocá “+ Prestación”.' : areaPlan === 'ESTETICA' ? 'Seleccioná zonas del rostro; o tocá “+ Prestación”.' : 'Tocá “+ Prestación” para el catálogo médico.'}</span>
                )}
              </div>
            </div>
          )}

          {!plan.bloqueado && drawerOpen && (
            <PanelAgregarPrestacion planId={plan.id} pacienteId={pacienteId} prestaciones={prestaciones}
              selPiezas={selPiezas} selCaras={selCaras} selZonas={selZonas} selZonasFax={selZonasFax}
              areaPlan={areaPlan} accion={accion} onClose={() => setDrawerOpen(false)} />
          )}

          {todas.length > 0 && (
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 text-[11px] uppercase tracking-wide text-slate-400">
              <span className="w-5" /><span className="flex-1">Prestación</span>
              <span className="hidden sm:block w-28">Pieza / zona</span><span className="w-11 sm:w-12 text-center">Dscto</span>
              <span className="w-20 sm:w-24 text-right">Precio</span><span className="w-7 sm:w-10 text-center">Pago</span><span className="w-4" />
            </div>
          )}

          {plan.secciones.map((s, i) => (
            <SeccionBloque key={s.id} seccion={s} plan={plan} prestaciones={prestaciones} pacienteId={pacienteId} selPiezas={selPiezas} selCaras={selCaras} selZonas={selZonas} selZonasFax={selZonasFax} clearSel={clearSel} accion={accion} onEvolucionar={onEvolucionar} onMoverAccion={moverAccion} idx={i} total={plan.secciones.length} onMover={moverSeccion} />
          ))}
          {plan.tratamientos.length > 0 && (
            <SeccionBloque seccion={{ id: '', titulo: 'Sin sección', orden: 0, fechaTentativa: null, diasDesdeAnterior: null, tratamientos: plan.tratamientos }} plan={plan} prestaciones={prestaciones} pacienteId={pacienteId} selPiezas={selPiezas} selCaras={selCaras} selZonas={selZonas} selZonasFax={selZonasFax} clearSel={clearSel} accion={accion} onEvolucionar={onEvolucionar} onMoverAccion={moverAccion} sinSeccion />
          )}
        </div>
      </div>
    </div>
  )
}

const FACE_NAME: Record<string, string> = { V: 'Vestibular', O: 'Oclusal/Incisal', L: 'Lingual/Palatino', M: 'Mesial', D: 'Distal' }
const EMPTY_FACES = new Set<string>()

function Leyenda({ color, l }: { color: string; l: string }) {
  return <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: color }} /> {l}</span>
}

function toothType(n: number): 'incisor' | 'canine' | 'premolar' | 'molar' {
  const d = n % 10
  if (d === 1 || d === 2) return 'incisor'
  if (d === 3) return 'canine'
  if (d === 4 || d === 5) return 'premolar'
  return 'molar'
}

// Silueta estilizada del diente (corona + raíces), alineada al ancho del círculo
// (30px). Raíz arriba en la arcada superior, abajo en la inferior. Clic = pieza.
function Crown({ n, upper, sel, conAccion, onClick }: { n: number; upper: boolean; sel: boolean; conAccion: boolean; onClick: () => void }) {
  const tipo = toothType(n)
  const W = 30, H = 24, crownH = 12
  const wide = tipo === 'molar' ? 22 : tipo === 'premolar' ? 17 : tipo === 'canine' ? 13 : 15
  const x0 = (W - wide) / 2
  const crownY = upper ? H - crownH : 0
  const baseY = upper ? crownY + 1 : crownH - 1
  const tip = upper ? 1.5 : H - 1.5
  const roots = tipo === 'molar' ? [W / 2 - 5, W / 2 + 5] : tipo === 'premolar' ? [W / 2 - 2.5, W / 2 + 2.5] : [W / 2]
  const fillCrown = sel ? '#7dd3fc' : conAccion ? '#e0f2fe' : '#f1f5f9'
  const stroke = sel ? '#0284c7' : '#cbd5e1'
  return (
    <button onClick={onClick} title={`Pieza ${n} completa`} className="block w-[30px] leading-none hover:opacity-80 transition-opacity">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto">
        {roots.map((rx, i) => (
          <path key={i} d={`M ${rx} ${baseY} L ${rx + (roots.length > 1 ? (i === 0 ? -1.5 : 1.5) : 0)} ${tip}`}
            stroke={stroke} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        ))}
        <rect x={x0} y={crownY} width={wide} height={crownH} rx={tipo === 'incisor' ? 3 : 5} ry="5" fill={fillCrown} stroke={stroke} strokeWidth="1.3" />
      </svg>
    </button>
  )
}

// Círculo de la pieza con sus 5 caras seleccionables (V arriba, L abajo,
// M/D a los lados, O al centro). Clic en una cara la marca; clic en el número
// selecciona/deselecciona la pieza completa.
function ToothCircle({ n, sel, carasSel, carasConAccion, numAbove, onFace, onWhole }: {
  n: number; sel: boolean; carasSel: string[]; carasConAccion: Set<string>; numAbove?: boolean
  onFace: (n: number, f: string) => void; onWhole: (n: number) => void
}) {
  const S = 30, a = S * 0.34
  const zonas: [string, string][] = [
    ['V', `0,0 ${S},0 ${S - a},${a} ${a},${a}`],
    ['L', `0,${S} ${S},${S} ${S - a},${S - a} ${a},${S - a}`],
    ['M', `0,0 ${a},${a} ${a},${S - a} 0,${S}`],
    ['D', `${S},0 ${S - a},${a} ${S - a},${S - a} ${S},${S}`],
    ['O', `${a},${a} ${S - a},${a} ${S - a},${S - a} ${a},${S - a}`],
  ]
  const fill = (f: string) => (carasSel.includes(f) ? '#0891b2' : carasConAccion.has(f) ? '#bae6fd' : '#ffffff')
  const num = (
    <button onClick={() => onWhole(n)} title={`Pieza ${n} completa`}
      className={`text-[9px] font-bold leading-none px-0.5 rounded ${sel ? 'text-cyan-700 bg-cyan-50' : 'text-slate-400 hover:text-slate-600'}`}>{n}</button>
  )
  return (
    <div className="flex flex-col items-center gap-0.5 w-[30px]">
      {numAbove && num}
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className={`shrink-0 rounded-sm ${sel ? 'ring-2 ring-cyan-400' : ''}`}>
        {zonas.map(([f, pts]) => (
          <polygon key={f} points={pts} fill={fill(f)} stroke="#94a3b8" strokeWidth="0.75"
            className="cursor-pointer hover:opacity-70 transition-opacity" onClick={() => onFace(n, f)}>
            <title>{`Pieza ${n} · ${FACE_NAME[f]}`}</title>
          </polygon>
        ))}
      </svg>
      {!numAbove && num}
    </div>
  )
}

function GroupBtn({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${active ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      {label}
    </button>
  )
}

function OdontogramaPlan({ caraMap, selPiezas, selCaras, selZonas, denticion, onFace, onWhole, onZona, onClear, onDenticion }: {
  caraMap: Map<number, Set<string>>; selPiezas: number[]; selCaras: Record<number, string[]>; selZonas: string[]; denticion: 'PERM' | 'TEMP'
  onFace: (n: number, f: string) => void; onWhole: (n: number) => void; onZona: (label: string) => void
  onClear: () => void; onDenticion: (d: 'PERM' | 'TEMP') => void
}) {
  const sup = denticion === 'PERM' ? SUP_PERM : SUP_TEMP
  const inf = denticion === 'PERM' ? INF_PERM : INF_TEMP
  const isSel = (n: number) => selPiezas.includes(n)
  const conAccion = (n: number) => (caraMap.get(n)?.size ?? 0) > 0
  const filaCirc = (nums: number[], numAbove: boolean) => (
    <div className="flex gap-1 justify-center min-w-max">
      {nums.map((n) => <ToothCircle key={n} n={n} sel={isSel(n)} carasSel={selCaras[n] ?? []} carasConAccion={caraMap.get(n) ?? EMPTY_FACES} numAbove={numAbove} onFace={onFace} onWhole={onWhole} />)}
    </div>
  )
  const filaCrown = (nums: number[], upper: boolean) => (
    <div className="flex gap-1 justify-center min-w-max">
      {nums.map((n) => <Crown key={n} n={n} upper={upper} sel={isSel(n)} conAccion={conAccion(n)} onClick={() => onWhole(n)} />)}
    </div>
  )
  const permCount = [...caraMap.keys()].filter((n) => n < 50).length
  const tempCount = [...caraMap.keys()].filter((n) => n >= 50).length
  const haySel = selPiezas.length > 0 || selZonas.length > 0
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1 text-sm">
          {(['PERM', 'TEMP'] as const).map((d) => (
            <button key={d} onClick={() => onDenticion(d)}
              className={`px-3 py-1 rounded-lg font-semibold ${denticion === d ? 'bg-cyan-50 text-cyan-700' : 'text-slate-400 hover:text-slate-600'}`}>
              {d === 'PERM' ? `Permanente${permCount ? ` (${permCount})` : ''}` : `Temporal${tempCount ? ` (${tempCount})` : ''}`}
            </button>
          ))}
          <span className="text-xs text-slate-300 ml-1">FDI</span>
        </div>
        {haySel && (
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-rose-600">Limpiar selección{selPiezas.length ? ` (${selPiezas.length})` : ''}</button>
        )}
      </div>

      <div className="space-y-0.5 overflow-x-auto pb-1">
        {filaCrown(sup, true)}
        {filaCirc(sup, false)}
        {filaCirc(inf, true)}
        {filaCrown(inf, false)}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
        <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Zona (sin dientes):</span>
        <GroupBtn label="Arcada superior" onClick={() => onZona('Arcada superior')} active={selZonas.includes('Arcada superior')} />
        <GroupBtn label="Arcada inferior" onClick={() => onZona('Arcada inferior')} active={selZonas.includes('Arcada inferior')} />
        {denticion === 'PERM' && SEXTANTES.map(([disp, val]) => (
          <GroupBtn key={val} label={disp} onClick={() => onZona(val)} active={selZonas.includes(val)} />
        ))}
      </div>

      {selZonas.length > 0 && <p className="text-xs text-cyan-700 mt-2">Zona{selZonas.length > 1 ? 's' : ''} seleccionada{selZonas.length > 1 ? 's' : ''}: <b>{selZonas.join(' + ')}</b> — se agregará una acción por cada zona, sin marcar dientes.</p>}

      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        <Leyenda color="#0891b2" l="Cara seleccionada" />
        <Leyenda color="#bae6fd" l="Con acción" />
        <span className="text-slate-400">Clic en una cara o en el número/silueta (pieza completa). V vestibular · O oclusal · L lingual/palatino · M mesial · D distal</span>
      </div>
    </div>
  )
}

function EvolucionModal({ accion, pacienteNombre, doctores, plan, onClose, onDone }: {
  accion: TratNode; pacienteNombre: string; doctores: DoctorDTO[]; plan: PlanDetalle
  onClose: () => void; onDone: () => void
}) {
  // Por defecto, el profesional que evoluciona es el titular / dr a cargo del plan
  // (modificable). Si el plan no tiene titular, cae al doctor propio de la acción.
  const [profesionalId, setProfesionalId] = useState(plan.doctorTitularId ?? accion.doctor?.id ?? doctores[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoyISO())
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function evolucionar() {
    if (!texto.trim()) { setErr('Escribe la evolución'); return }
    setGuardando(true); setErr('')
    try {
      await tratamientosService.evolucionar(accion.id, { texto: texto.trim(), profesionalId: profesionalId || undefined, fecha })
      onDone()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error'); setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Nueva evolución</h3>
          <p className="text-sm text-slate-500">Paciente {pacienteNombre} · {accion.prestacion.nombre}{accion.diente ? ` · Pieza ${accion.diente}` : ''}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Profesional</span>
              <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Sin asignar</option>
                {doctoresDeArea(doctores, (plan.area || 'DENTAL') as AreaClinica, profesionalId || undefined).map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
              </select>
              {plan.doctorTitularId && profesionalId === plan.doctorTitularId && (
                <span className="text-[11px] text-slate-400 mt-0.5 block">Por defecto: dr a cargo del plan (puedes cambiarlo).</span>
              )}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Evolución</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} autoFocus
              placeholder="Describe la evolución clínica. Queda registrada en la ficha del paciente y marca la acción como realizada."
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg">Cerrar</button>
          <button onClick={evolucionar} disabled={guardando || !texto.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">{guardando ? 'Guardando…' : 'Evolucionar'}</button>
        </div>
      </div>
    </div>
  )
}

function SeccionBloque({ seccion, plan, prestaciones, pacienteId, selPiezas, selCaras, selZonas, selZonasFax, clearSel, accion, onEvolucionar, onMoverAccion, sinSeccion, idx, total, onMover }: {
  seccion: SeccionNode; plan: PlanDetalle; prestaciones: PrestacionDTO[]; pacienteId: string
  selPiezas: number[]; selCaras: Record<number, string[]>; selZonas: string[]; selZonasFax: Set<string>; clearSel: () => void
  accion: (fn: () => Promise<unknown>) => Promise<void>; onEvolucionar: (t: TratNode) => void
  onMoverAccion?: (tratId: string, seccionId: string) => void; sinSeccion?: boolean
  idx?: number; total?: number; onMover?: (idx: number, dir: -1 | 1) => void
}) {
  const [agregando, setAgregando] = useState(false)
  const [over, setOver] = useState(false)
  // Edición inline del encabezado de la sección (nombre + tiempo tentativo).
  const toYmd = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '')
  const [editando, setEditando] = useState(false)
  const [edTitulo, setEdTitulo] = useState(seccion.titulo)
  const [edFecha, setEdFecha] = useState(toYmd(seccion.fechaTentativa))
  const [edDias, setEdDias] = useState(seccion.diasDesdeAnterior != null ? String(seccion.diasDesdeAnterior) : '')
  const [edUnidad, setEdUnidad] = useState(seccion.tiempoUnidad ?? 'DIAS')
  function abrirEdicion() {
    setEdTitulo(seccion.titulo); setEdFecha(toYmd(seccion.fechaTentativa))
    setEdDias(seccion.diasDesdeAnterior != null ? String(seccion.diasDesdeAnterior) : '')
    setEdUnidad(seccion.tiempoUnidad ?? 'DIAS')
    setEditando(true)
  }
  async function guardarSeccion() {
    await accion(() => seccionesService.actualizar(seccion.id, {
      titulo: edTitulo.trim() || seccion.titulo,
      fechaTentativa: edFecha ? new Date(`${edFecha}T00:00`).toISOString() : null,
      diasDesdeAnterior: edDias.trim() ? Math.max(0, Number(edDias)) : null,
      tiempoUnidad: edUnidad,
    }))
    setEditando(false)
  }
  const totalSec = seccion.tratamientos.reduce((s, t) => s + netoTrat(t), 0)
  const tiempo = seccion.diasDesdeAnterior != null
    ? labelTiempoEstimado(seccion.diasDesdeAnterior, seccion.tiempoUnidad)
    : (seccion.fechaTentativa ? `Tentativa: ${new Date(seccion.fechaTentativa).toLocaleDateString('es-CL')}` : null)
  const seleccion = selZonas.length ? selZonas.join(' + ') : (selPiezas.length ? `${selPiezas.length} pieza${selPiezas.length > 1 ? 's' : ''}` : '')

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-colors ${over ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200'}`}
      onDragOver={(e) => { if (!plan.bloqueado && onMoverAccion) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id && onMoverAccion) onMoverAccion(id, seccion.id) }}>
      {editando && !sinSeccion ? (
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <input value={edTitulo} onChange={(e) => setEdTitulo(e.target.value)} placeholder="Nombre de la sección"
            className="flex-1 min-w-[10rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          <label className="flex items-center gap-1 text-xs text-slate-500">Fecha tentativa
            <input type="date" value={edFecha} onChange={(e) => setEdFecha(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" /></label>
          <label className="flex items-center gap-1 text-xs text-slate-500">Tiempo estimado
            <input value={edDias} onChange={(e) => setEdDias(e.target.value)} inputMode="numeric" placeholder="—" className="w-14 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
            <select value={edUnidad} onChange={(e) => setEdUnidad(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
              <option value="DIAS">días</option>
              <option value="SEMANAS">semanas</option>
              <option value="MESES">meses</option>
            </select></label>
          <button onClick={guardarSeccion} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg">Guardar</button>
          <button onClick={() => setEditando(false)} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
        </div>
      ) : (
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm truncate">{seccion.titulo}</span>
          {tiempo && <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 whitespace-nowrap">⏱ {tiempo}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-600">{fmtCLP(totalSec)}</span>
          {!sinSeccion && !plan.bloqueado && (
            <button onClick={abrirEdicion} className="text-slate-300 hover:text-cyan-600 text-sm" title="Editar nombre y tiempo tentativo">✎</button>
          )}
          {!sinSeccion && !plan.bloqueado && onMover && idx != null && total != null && (
            <div className="flex flex-col -my-1 leading-none">
              <button disabled={idx === 0} onClick={() => onMover(idx, -1)} className="text-slate-300 hover:text-cyan-600 disabled:opacity-30 text-[10px]" title="Subir sección">▲</button>
              <button disabled={idx === total - 1} onClick={() => onMover(idx, 1)} className="text-slate-300 hover:text-cyan-600 disabled:opacity-30 text-[10px]" title="Bajar sección">▼</button>
            </div>
          )}
          {!sinSeccion && !plan.bloqueado && (
            <button onClick={() => accion(() => seccionesService.eliminar(seccion.id))} className="text-slate-300 hover:text-rose-600 text-sm" title="Eliminar sección">🗑</button>
          )}
        </div>
      </div>
      )}
      <div className="divide-y divide-slate-100">
        {seccion.tratamientos.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">Sin acciones.</p>}
        {seccion.tratamientos.map((t) => <AccionFila key={t.id} t={t} bloqueado={plan.bloqueado} accion={accion} onEvolucionar={onEvolucionar} />)}
      </div>
      {!plan.bloqueado && !sinSeccion && (
        <div className="px-4 py-2 border-t border-slate-100">
          {agregando
            ? <AgregarAccion planId={plan.id} seccionId={seccion.id} pacienteId={pacienteId} prestaciones={prestaciones} selPiezas={selPiezas} selCaras={selCaras} selZonas={selZonas} selZonasFax={selZonasFax} clearSel={clearSel} accion={accion} onDone={() => setAgregando(false)} />
            : <button onClick={() => setAgregando(true)} className="text-xs font-semibold text-cyan-700">+ Agregar prestación{seleccion ? ` (${seleccion})` : ''}</button>}
        </div>
      )}
    </div>
  )
}

// Carrito "marcar para cobro". SVG (toma el color: gris sin marcar, verde marcado).
function CartIcon({ marcado }: { marcado: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={marcado ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.4l2.3 12.1a1.5 1.5 0 0 0 1.5 1.2h8.5a1.5 1.5 0 0 0 1.5-1.2L21 7H6" fill="none" />
    </svg>
  )
}

function AccionFila({ t, bloqueado, accion, onEvolucionar }: {
  t: TratNode; bloqueado: boolean; accion: (fn: () => Promise<unknown>) => Promise<void>; onEvolucionar: (t: TratNode) => void
}) {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const puedeRevertir = esAdmin || Boolean(user?.permisos?.puedeRevertirCompletado)
  const puedeModificarPrecio = esAdmin || Boolean(user?.permisos?.puedeModificarPrecio)
  const puedeAplicarDescuento = esAdmin || Boolean(user?.permisos?.puedeAplicarDescuento)
  const completado = t.estado === 'COMPLETADO'
  const pagada = pagadaTrat(t)
  // Realizada con abono PARCIAL (pagó algo pero no cubre el neto) → amarillo.
  const abonoParcial = completado && !pagada && pagadoTrat(t) > 0.5
  const liquidada = (t._count?.liquidacionItems ?? 0) > 0 // ya pagada al profesional
  // Una acción realizada bloquea precio y descuento (hay que desrealizarla primero).
  const precioEditable = !bloqueado && !completado && puedeModificarPrecio
  const dsctoEditable = !bloqueado && !completado && puedeAplicarDescuento
  const [edit, setEdit] = useState<null | 'precio' | 'dscto'>(null)
  const [val, setVal] = useState('')
  // Al pinchar una acción ya realizada se despliega su trazabilidad (fecha,
  // profesional a cargo y evolución anotada). Cerrado por defecto.
  const [verDetalle, setVerDetalle] = useState(false)
  // Desevolucionar (revertir a planificada): requiere permiso, confirmación, y que
  // la acción NO esté liquidada (ya pagada al profesional).
  const puedeDesevolucionar = puedeRevertir && !liquidada
  const revertir = () => {
    if (!puedeRevertir) return
    if (liquidada) { window.alert('Esta acción ya fue liquidada (pagada al profesional) y no se puede desevolucionar.'); return }
    if (!window.confirm('¿Desevolucionar esta acción? Volverá a quedar como planificada (no realizada) y se quitará de lo realizado del paciente.')) return
    accion(() => tratamientosService.actualizar(t.id, { estado: 'PLANIFICADO', fechaCompletado: null }))
  }
  const zonasLabel = (t.zonas ?? []).map((z) => z.zona.nombreVisible).join(', ')
  const piezaLabel = t.diente
    ? `${t.diente}${t.cara ? ` (${t.cara.split('').join(',')})` : ''}`
    : (zonasLabel || (t.cara ? t.cara : (t.notas ? t.notas.replace(/^Piezas:\s*/, '') : '—')))

  function abrir(campo: 'precio' | 'dscto') {
    if (campo === 'precio' ? !precioEditable : !dsctoEditable) return
    setVal(String(campo === 'precio' ? Math.round(t.precio) : (t.descuento || 0)))
    setEdit(campo)
  }
  function guardar() {
    const campo = edit
    setEdit(null)
    if (campo === 'precio') {
      const n = Math.max(0, Math.round(Number(val)))
      if (Number.isFinite(n) && n !== Math.round(t.precio)) accion(() => tratamientosService.actualizar(t.id, { precio: n }))
    } else if (campo === 'dscto') {
      const n = Math.max(0, Math.min(100, Math.round(Number(val))))
      if (Number.isFinite(n) && n !== (t.descuento || 0)) accion(() => tratamientosService.actualizar(t.id, { descuento: n }))
    }
  }

  return (
    <div>
    <div className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 ${!bloqueado && !edit ? 'cursor-move' : ''}`}
      draggable={!bloqueado && !edit}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}>
      <button onClick={() => (completado ? revertir() : onEvolucionar(t))}
        disabled={completado && !puedeDesevolucionar}
        title={completado
          ? (liquidada ? 'Realizada y liquidada (pagada al profesional): no se puede desevolucionar'
            : puedeRevertir ? 'Realizada — clic para desevolucionar' : 'Realizada (no tienes permiso para desevolucionar)')
          : 'Evolucionar / marcar como realizada'}
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${completado ? `bg-emerald-500 text-white ${puedeDesevolucionar ? '' : 'cursor-default opacity-90'}` : 'border-2 border-slate-300 hover:border-cyan-400'}`}>
        {completado ? '✓' : ''}
      </button>
      {completado ? (
        <button type="button" onClick={() => setVerDetalle((v) => !v)} draggable={false}
          title="Ver detalle de la realización (fecha, profesional y evolución)"
          className="min-w-0 flex-1 text-left flex items-center gap-1">
          <span className="min-w-0 flex-1">
            <span className="text-sm text-slate-800 truncate flex items-center gap-1">
              {t.prestacion.nombre}
              <span className="text-cyan-500 text-xs shrink-0">{verDetalle ? '▾' : '▸'}</span>
            </span>
            <span className="sm:hidden block text-xs text-slate-400 truncate">{piezaLabel}</span>
          </span>
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-800 truncate">{t.prestacion.nombre}</p>
          {/* En móvil la pieza/zona va bajo el nombre (la columna de la derecha se oculta). */}
          <p className="sm:hidden text-xs text-slate-400 truncate">{piezaLabel}</p>
        </div>
      )}
      {completado ? (
        <button type="button" onClick={() => setVerDetalle((v) => !v)} draggable={false}
          className="hidden sm:block w-28 text-left text-sm text-slate-600 truncate" title={piezaLabel}>{piezaLabel}</button>
      ) : (
        <span className="hidden sm:block w-28 text-sm text-slate-600 truncate" title={piezaLabel}>{piezaLabel}</span>
      )}

      {/* Descuento (editable, 0% por defecto) */}
      {edit === 'dscto' ? (
        <input autoFocus type="number" min={0} max={100} value={val} onChange={(e) => setVal(e.target.value)} onBlur={guardar} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEdit(null) }}
          className="w-11 sm:w-12 text-center text-sm border border-cyan-400 rounded px-1 py-0.5 focus:outline-none shrink-0" />
      ) : (
        <button onClick={() => abrir('dscto')} disabled={!dsctoEditable} title={completado ? 'Acción realizada: descuento bloqueado' : (dsctoEditable ? 'Editar descuento' : '')}
          className="w-11 sm:w-12 text-center text-sm text-slate-500 enabled:hover:text-cyan-600 disabled:cursor-default shrink-0">{t.descuento ? `${t.descuento}%` : (dsctoEditable ? '0%' : '—')}</button>
      )}

      {/* Precio (editable: se edita el precio base; se muestra el neto con descuento) */}
      {edit === 'precio' ? (
        <input autoFocus type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)} onBlur={guardar} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEdit(null) }}
          className="w-20 sm:w-24 text-right text-sm font-mono border border-cyan-400 rounded px-1 py-0.5 focus:outline-none shrink-0" />
      ) : (
        <button onClick={() => abrir('precio')} disabled={!precioEditable}
          title={completado ? 'Acción realizada: precio bloqueado' : (t.descuento ? `Precio base ${fmtCLP(t.precio)} · neto ${fmtCLP(netoTrat(t))}` : (precioEditable ? 'Editar precio' : ''))}
          className="w-20 sm:w-24 text-right text-sm font-mono text-slate-700 enabled:hover:text-cyan-600 disabled:cursor-default shrink-0">{fmtCLP(netoTrat(t))}</button>
      )}

      {/* Carrito: marcar una acción NO realizada ni pagada para incluirla en la
          próxima recaudación. Gris = sin marcar, verde = marcada para cobro. */}
      {!completado && !pagada ? (
        <button onClick={() => accion(() => tratamientosService.actualizar(t.id, { paraCobro: !t.paraCobro }))}
          title={t.paraCobro ? 'Marcada para cobro (clic para quitar)' : 'Marcar para cobro'}
          className={`shrink-0 ${t.paraCobro ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}>
          <CartIcon marcado={Boolean(t.paraCobro)} />
        </button>
      ) : <span className="shrink-0 w-[18px]" />}

      {/* Estado de PAGO (independiente del ✓ realizada de la izquierda): verde = pagada ·
          amarillo = realizada con abono parcial · rojo = realizada impaga (DEUDA) · azul = sin realizar. */}
      <span className="w-7 sm:w-10 flex justify-center shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${pagada ? 'bg-emerald-500' : abonoParcial ? 'bg-amber-400' : completado ? 'bg-rose-500' : 'bg-sky-500'}`}
          title={pagada ? 'Pagada' : abonoParcial ? 'Realizada con abono parcial' : completado ? 'En deuda (realizada e impaga)' : 'Agregada (aún sin realizar)'} />
      </span>
      {!bloqueado
        ? <button onClick={() => accion(() => tratamientosService.eliminar(t.id))} className="w-4 text-slate-300 hover:text-rose-600 text-sm shrink-0" title="Quitar">×</button>
        : <span className="w-4" />}
    </div>
    {completado && verDetalle && (
      <div className="mx-3 sm:mx-4 mb-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 space-y-1.5">
        <div className="flex flex-wrap gap-x-5 gap-y-0.5">
          <span><span className="text-slate-400">Realizada el:</span> {t.fechaCompletado ? new Date(t.fechaCompletado).toLocaleDateString('es-CL', { dateStyle: 'long' }) : '—'}</span>
          <span><span className="text-slate-400">Profesional a cargo:</span> {t.doctor?.name ?? 'Sin asignar'}</span>
        </div>
        <div className="pt-1 border-t border-slate-200">
          <p className="text-slate-400 mb-0.5">Evolución anotada</p>
          {t.evoluciones && t.evoluciones.length > 0 ? (
            <div className="space-y-1.5">
              {t.evoluciones.map((e) => (
                <div key={e.id}>
                  <p className="text-slate-700 whitespace-pre-wrap">{e.texto}</p>
                  <p className="text-[11px] text-slate-400">{new Date(e.fecha).toLocaleDateString('es-CL', { dateStyle: 'medium' })}{e.autor ? ` · registrada por ${e.autor.name ?? e.autor.email}` : ''}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 italic">Sin evolución anotada al momento de realizarla.</p>
          )}
        </div>
      </div>
    )}
    </div>
  )
}

// Buscador de prestaciones (hay cientos en el arancel): filtra a medida que se
// escribe en vez de una lista desplegable gigante.
function PrestacionBuscador({ prestaciones, onSelect }: { prestaciones: PrestacionDTO[]; onSelect: (p: PrestacionDTO) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const term = q.trim().toLowerCase()
  const results = (term ? prestaciones.filter((p) => p.nombre.toLowerCase().includes(term) || (p.categoria ?? '').toLowerCase().includes(term)) : prestaciones).slice(0, 40)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Buscar prestación…" autoFocus
        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-64 overflow-y-auto">
          {results.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Sin resultados</p>}
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => { onSelect(p); setQ(p.nombre); setOpen(false) }}
              className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-800">{p.nombre}</span>
              <span className="text-xs text-slate-400 ml-2 font-mono">{fmtCLP(p.precio)}</span>
              {p.categoria && <span className="block text-[11px] text-slate-400">{p.categoria}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AgregarAccion({ planId, seccionId, pacienteId, prestaciones, selPiezas, selCaras, selZonas, selZonasFax, clearSel, accion, onDone }: {
  planId: string; seccionId: string; pacienteId: string; prestaciones: PrestacionDTO[]
  selPiezas: number[]; selCaras: Record<number, string[]>; selZonas: string[]; selZonasFax: Set<string>; clearSel: () => void
  accion: (fn: () => Promise<unknown>) => Promise<void>; onDone: () => void
}) {
  const [prestId, setPrestId] = useState('')
  const [modo, setModo] = useState<'porPieza' | 'unaSola'>('porPieza')
  const [buscadorKey, setBuscadorKey] = useState(0) // remonta el buscador para limpiarlo entre acciones
  const [agregadas, setAgregadas] = useState(0)
  const prest = prestaciones.find((p) => p.id === prestId)
  const piezas = [...selPiezas].sort((a, b) => a - b)
  const resumen = piezas.map((n) => `${n}${selCaras[n]?.length ? `(${selCaras[n].join('')})` : ''}`).join(', ')

  async function añadir() {
    if (!prestId) return
    await accion(async () => {
      if (selZonasFax.size > 0) {
        // Estética: UN tratamiento que cubre TODAS las zonas seleccionadas con UN
        // precio (bótox de patas de gallo = un procedimiento, dos zonas, un precio).
        await tratamientosService.crear({ pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio, zonaIds: [...selZonasFax] })
      } else if (selZonas.length > 0) {
        // Una acción por cada zona seleccionada (arcada superior, inferior, sextante…), sin dientes.
        await Promise.all(selZonas.map((zona) => tratamientosService.crear({ pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio, zona })))
      } else if (piezas.length === 0 || modo === 'unaSola') {
        await tratamientosService.crear({
          pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio,
          ...(piezas.length ? { notas: `Piezas: ${resumen}` } : {}),
        })
      } else {
        // Una acción por pieza, con sus propias caras.
        await Promise.all(piezas.map((n) => tratamientosService.crear({
          pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio,
          piezas: [n], cara: selCaras[n]?.length ? selCaras[n].join('') : undefined,
        })))
      }
    })
    // NO se limpia la selección NI se cierra el form: así se pueden cargar varias
    // acciones a la(s) misma(s) pieza(s) sin volver a marcarlas ni reabrir. Solo se
    // limpia la prestación elegida (se remonta el buscador). Cierra con "Listo".
    setPrestId(''); setBuscadorKey((k) => k + 1); setAgregadas((n) => n + 1)
  }

  return (
    <div className="space-y-2 py-1">
      <PrestacionBuscador key={buscadorKey} prestaciones={prestaciones} onSelect={(p) => setPrestId(p.id)} />
      {selZonas.length > 0 ? (
        <p className="text-xs text-cyan-700">Asociada a <b>{selZonas.join(' + ')}</b> (sin dientes){selZonas.length > 1 ? ` · ${selZonas.length} acciones` : ''}{prest ? ` · ${fmtCLP(prest.precio * selZonas.length)}` : ''}.</p>
      ) : piezas.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">Piezas seleccionadas: <span className="font-mono text-slate-700">{resumen}</span></p>
          <div className="flex flex-col gap-1 text-xs text-slate-600">
            <label className="flex items-center gap-2"><input type="radio" checked={modo === 'porPieza'} onChange={() => setModo('porPieza')} /> Una prestación <b>por cada pieza</b> ({piezas.length} acciones{prest ? ` · ${fmtCLP(prest.precio * piezas.length)}` : ''})</label>
            <label className="flex items-center gap-2"><input type="radio" checked={modo === 'unaSola'} onChange={() => setModo('unaSola')} /> Una <b>sola prestación</b> para todas{prest ? ` · ${fmtCLP(prest.precio)}` : ''}</label>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Sin selección → se agrega como prestación general. Marca piezas o una zona en el odontograma para asociarla.</p>
      )}
      <div className="flex items-center gap-2">
        <button onClick={añadir} disabled={!prestId} className="px-3 py-1.5 bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg">Agregar</button>
        <button onClick={onDone} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">{agregadas > 0 ? 'Listo' : 'Cancelar'}</button>
        {agregadas > 0 && <span className="text-xs text-emerald-600">✓ {agregadas} acción{agregadas > 1 ? 'es' : ''} agregada{agregadas > 1 ? 's' : ''} · la selección se mantiene</span>}
      </div>
    </div>
  )
}

// Panel lateral (drawer) para cargar prestaciones — estilo "definir procedimiento":
// buscador + navegación por categorías, con la selección de piezas/zonas del
// diagrama (que queda a la vista) y el toggle una-por-pieza / una-para-todas.
// Reutiliza la MISMA lógica de creación que AgregarAccion (los 4 casos).
function PanelAgregarPrestacion({ planId, pacienteId, prestaciones, selPiezas, selCaras, selZonas, selZonasFax, areaPlan, accion, onClose }: {
  planId: string; pacienteId: string; prestaciones: PrestacionDTO[]
  selPiezas: number[]; selCaras: Record<number, string[]>; selZonas: string[]; selZonasFax: Set<string>
  areaPlan: AreaClinica; accion: (fn: () => Promise<unknown>) => Promise<void>; onClose: () => void
}) {
  const [prest, setPrest] = useState<PrestacionDTO | null>(null)
  const [modo, setModo] = useState<'porPieza' | 'unaSola'>('porPieza')
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [agregadas, setAgregadas] = useState(0)

  // Mobile: deslizar la barra gris hacia abajo cierra el panel (gesto natural).
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)
  const onDragStart = (e: RPointerEvent<HTMLDivElement>) => { dragStart.current = e.clientY; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId) }
  const onDragMove = (e: RPointerEvent<HTMLDivElement>) => { if (dragStart.current != null) setDragY(Math.max(0, e.clientY - dragStart.current)) }
  const onDragEnd = () => { if (dragStart.current == null) return; const cerrar = dragY > 90; dragStart.current = null; setDragging(false); if (cerrar) onClose(); else setDragY(0) }

  // Mobile: al abrir el panel inferior, subir el diagrama justo debajo del header
  // fijo para que las piezas/zonas queden a la vista (y no el presupuesto de arriba).
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    const el = document.getElementById('plan-diagrama')
    if (!el) return
    const offset = (document.querySelector('header')?.getBoundingClientRect().height ?? 0) + 8
    const y = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }, [])

  const piezas = [...selPiezas].sort((a, b) => a - b)
  const resumen = piezas.map((n) => `${n}${selCaras[n]?.length ? `(${selCaras[n].join('')})` : ''}`).join(', ')

  // Catálogo agrupado por categoría (sección). Sin categoría → "Otras".
  const categorias = useMemo(() => {
    const m = new Map<string, PrestacionDTO[]>()
    for (const p of prestaciones) { const c = p.categoria?.trim() || 'Otras'; const arr = m.get(c) ?? []; arr.push(p); m.set(c, arr) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [prestaciones])
  const q = busca.trim().toLowerCase()
  const resultados = useMemo(() => q ? prestaciones.filter((p) => p.nombre.toLowerCase().includes(q) || (p.categoria ?? '').toLowerCase().includes(q)) : [], [q, prestaciones])

  const multiZonas = selZonas.length >= 2 // 2+ arcadas/sextantes
  const multi = piezas.length >= 2 || multiZonas
  const unidad = multiZonas ? 'zona' : 'pieza'
  const nAcc = selZonasFax.size > 0 ? 1
    : selZonas.length > 0 ? (multiZonas && modo === 'unaSola' ? 1 : selZonas.length)
    : (piezas.length >= 2 && modo === 'porPieza' ? piezas.length : 1)
  const total = prest ? prest.precio * nAcc : 0

  async function agregar() {
    if (!prest) return
    setGuardando(true)
    try {
      await accion(async () => {
        if (selZonasFax.size > 0) {
          await tratamientosService.crear({ pacienteId, prestacionId: prest.id, planId, seccionId: '', precio: prest.precio, zonaIds: [...selZonasFax] })
        } else if (selZonas.length > 0) {
          if (multiZonas && modo === 'unaSola') {
            // Una sola acción que cubre todas las zonas (arcadas/sextantes) con un precio.
            await tratamientosService.crear({ pacienteId, prestacionId: prest.id, planId, seccionId: '', precio: prest.precio, zona: selZonas.join(' + ') })
          } else {
            await Promise.all(selZonas.map((zona) => tratamientosService.crear({ pacienteId, prestacionId: prest.id, planId, seccionId: '', precio: prest.precio, zona })))
          }
        } else if (piezas.length === 0 || modo === 'unaSola') {
          await tratamientosService.crear({ pacienteId, prestacionId: prest.id, planId, seccionId: '', precio: prest.precio, ...(piezas.length ? { notas: `Piezas: ${resumen}` } : {}) })
        } else {
          await Promise.all(piezas.map((n) => tratamientosService.crear({ pacienteId, prestacionId: prest.id, planId, seccionId: '', precio: prest.precio, piezas: [n], cara: selCaras[n]?.length ? selCaras[n].join('') : undefined })))
        }
      })
      // Se mantiene la selección (para cargar varias) y el panel abierto; solo limpia la prestación.
      setPrest(null); setAgregadas((n) => n + 1)
    } finally { setGuardando(false) }
  }

  const items = cat ? (categorias.find(([c]) => c === cat)?.[1] ?? []) : []
  const selTxt = selZonasFax.size > 0 ? `${selZonasFax.size} zona(s) del rostro`
    : selZonas.length > 0 ? selZonas.join(', ')
    : piezas.length > 0 ? resumen : 'Ninguna · prestación general'

  return (
    // Mobile: panel INFERIOR (bottom sheet) que deja el diagrama visible arriba para
    // seguir marcando piezas/zonas. Escritorio (lg): panel lateral izquierdo de alto
    // completo. En ambos, sin capa que bloquee el diagrama.
    <div style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      className={`fixed z-40 bg-white shadow-2xl flex flex-col overflow-hidden
      inset-x-0 bottom-0 max-h-[55vh] rounded-t-2xl ${dragging ? '' : 'transition-transform duration-200'}
      lg:inset-x-auto lg:top-0 lg:bottom-0 lg:left-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:transition-none`}>
      {/* Barra: deslizala hacia abajo para cerrar (solo mobile). */}
      <div className="lg:hidden py-3 flex justify-center shrink-0 cursor-grab touch-none"
        onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
        <span className="h-1.5 w-12 rounded-full bg-slate-300" />
      </div>
      <div className="bg-cyan-600 text-white px-4 py-3 flex items-center gap-2 shrink-0">
        {(cat || q) && <button onClick={() => { setCat(null); setBusca('') }} className="text-white/90 hover:text-white text-xl leading-none px-1">‹</button>}
        <span className="font-semibold flex-1 truncate">{cat ?? 'Definir prestación'}</span>
        <button onClick={onClose} aria-label="Cerrar" className="flex items-center gap-1 text-white/90 hover:text-white text-sm font-medium bg-white/15 rounded-lg px-2.5 py-1.5">Cerrar ✕</button>
      </div>
      <div className="p-3 border-b border-slate-100 shrink-0">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar prestación o categoría…"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
      </div>
      <div className="flex-1 overflow-auto">
        {q ? (
          resultados.length === 0
            ? <p className="px-4 py-6 text-sm text-slate-400 text-center">Sin resultados.</p>
            : resultados.map((p) => <ProdRow key={p.id} p={p} on={prest?.id === p.id} onClick={() => setPrest(p)} />)
        ) : cat ? (
          items.map((p) => <ProdRow key={p.id} p={p} on={prest?.id === p.id} onClick={() => setPrest(p)} />)
        ) : (
          categorias.map(([c, arr]) => (
            <button key={c} onClick={() => setCat(c)} className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100 hover:bg-slate-50 text-left text-sm">
              <span>{c}<span className="block text-xs text-slate-400">{arr.length} prestación{arr.length > 1 ? 'es' : ''}</span></span>
              <span className="text-slate-300">›</span>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-slate-200 p-3 bg-slate-50 space-y-2 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{(areaPlan === 'ESTETICA' || selZonas.length > 0) ? 'Zonas' : 'Piezas'} seleccionadas</p>
            <p className="text-xs font-mono text-cyan-700 truncate">{selTxt}</p>
          </div>
          {multi && (
            <label className="text-right text-xs text-slate-600 shrink-0 cursor-pointer">
              <span className="block">{modo === 'porPieza' ? `Una por cada ${unidad}` : 'Una para todas'}</span>
              <input type="checkbox" checked={modo === 'unaSola'} onChange={(e) => setModo(e.target.checked ? 'unaSola' : 'porPieza')} className="scale-125 mt-0.5" />
            </label>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 truncate">{prest ? prest.nombre : 'Elegí una prestación ↑'}</span>
          <span className="font-mono font-bold text-cyan-700 shrink-0">{fmtCLP(total)}</span>
        </div>
        <button onClick={agregar} disabled={!prest || guardando}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white">
          {guardando ? '…' : '+ Agregar prestación'}
        </button>
        {agregadas > 0 && <p className="text-xs text-emerald-600 text-center">✓ {agregadas} agregada{agregadas > 1 ? 's' : ''} · la selección se mantiene</p>}
      </div>
    </div>
  )
}

function ProdRow({ p, on, onClick }: { p: PrestacionDTO; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-4 py-3 border-b border-slate-100 text-left text-sm ${on ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
      <span className="min-w-0"><span className="block truncate">{p.nombre}</span><span className="block text-xs text-slate-400 font-mono">{fmtCLP(p.precio)}</span></span>
      {on ? <span className="text-emerald-600 font-bold shrink-0">✓</span> : <span className="text-xs text-slate-300 shrink-0">elegir ›</span>}
    </button>
  )
}

function AgregarSeccion({ planId, accion, sinSeccionIds }: { planId: string; accion: (fn: () => Promise<unknown>) => Promise<void>; sinSeccionIds: string[] }) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [dias, setDias] = useState('')
  const [unidad, setUnidad] = useState('DIAS')
  const [fecha, setFecha] = useState('')
  const [incorporar, setIncorporar] = useState(true)
  const haySueltas = sinSeccionIds.length > 0

  async function crear() {
    await accion(async () => {
      const sec = await planesService.crearSeccion(planId, {
        titulo: titulo.trim() || undefined,
        diasDesdeAnterior: dias ? Number(dias) : undefined,
        tiempoUnidad: unidad,
        fechaTentativa: fecha ? new Date(`${fecha}T00:00`).toISOString() : undefined,
      }) as { id: string }
      // Mueve automáticamente todas las prestaciones "sin sección" a la nueva sección.
      if (incorporar && haySueltas && sec?.id) {
        await Promise.all(sinSeccionIds.map((tid) => tratamientosService.actualizar(tid, { seccionId: sec.id })))
      }
    })
    setAbierto(false); setTitulo(''); setDias(''); setUnidad('DIAS'); setFecha('')
  }

  if (!abierto) return <button onClick={() => setAbierto(true)} className="text-sm font-semibold text-cyan-700">+ Sección</button>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex gap-2 flex-wrap items-center">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre de la sección" className="flex-1 min-w-[12rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      <label className="flex items-center gap-1 text-xs text-slate-500">Fecha tentativa
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" /></label>
      <label className="flex items-center gap-1 text-xs text-slate-500">Tiempo estimado
        <input value={dias} onChange={(e) => setDias(e.target.value)} placeholder="—" inputMode="numeric" className="w-14 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
        <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
          <option value="DIAS">días</option>
          <option value="SEMANAS">semanas</option>
          <option value="MESES">meses</option>
        </select></label>
      {haySueltas && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600 w-full">
          <input type="checkbox" checked={incorporar} onChange={(e) => setIncorporar(e.target.checked)} />
          Incorporar las {sinSeccionIds.length} prestación{sinSeccionIds.length === 1 ? '' : 'es'} sin sección a esta sección
        </label>
      )}
      <button onClick={crear} className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg">Crear</button>
      <button onClick={() => setAbierto(false)} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
    </div>
  )
}

// ── Recaudación: pagar acciones pendientes o registrar un abono libre al plan ──
function RecaudacionTab({ pacienteId }: { pacienteId: string }) {
  const { user } = useAuth()
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [planId, setPlanId] = useState('') // plan destino del abono libre nuevo / derivar
  const [detalles, setDetalles] = useState<PlanDetalle[]>([]) // TODOS los planes (se cobra a través de varios)
  // Cada usuario recibe pagos SÓLO con su propia caja abierta: no hay selector.
  const [miCaja, setMiCaja] = useState<{ id: string; numero: number } | null>(null)
  const [medios, setMedios] = useState<MedioPagoDTO[]>([])
  const [medioPagoId, setMedioPagoId] = useState('')
  const [numeroReferencia, setNumeroReferencia] = useState('')
  const [numeroBoleta, setNumeroBoleta] = useState('')
  // Segundo medio de pago (pago dividido): monto2 va a este medio; el resto al primero.
  const [dividir, setDividir] = useState(false)
  const [medioPago2Id, setMedioPago2Id] = useState('')
  const [monto2, setMonto2] = useState('')
  const [numeroReferencia2, setNumeroReferencia2] = useState('')
  const [sel, setSel] = useState<Record<string, number>>({})
  const [abono, setAbono] = useState('')
  const [usarAbono, setUsarAbono] = useState(true) // usar el abono libre del plan como "pie"
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [derivar, setDerivar] = useState(false)

  const medioSel = medios.find((m) => m.id === medioPagoId)
  const requiereRef = Boolean(medioSel?.requiereReferencia)
  const medioSel2 = medios.find((m) => m.id === medioPago2Id)
  const requiereRef2 = dividir && Boolean(medioSel2?.requiereReferencia)

  // Carga los planes y el detalle de TODOS (para poder cobrar acciones de varios).
  const cargarTodo = () => {
    planesService.listar(pacienteId).then(async (p) => {
      const ps = p as PlanCard[]; setPlanes(ps); setPlanId((x) => x || ps[0]?.id || '')
      const dets = await Promise.all(ps.map((pl) => planesService.obtener(pl.id).then((d) => d as PlanDetalle).catch(() => null)))
      setDetalles(dets.filter((d): d is PlanDetalle => d != null))
    }).catch(() => {})
  }
  useEffect(() => {
    cargarTodo()
    // Sólo la caja PROPIA del usuario que esté abierta (no las de otros usuarios).
    cajasService.resumen().then((c) => {
      const list = c as { id: string; numero: number; sesionAbierta: { numero: number } | null; usuarios?: { user: { id: string } }[] }[]
      const propia = list.find((x) => x.sesionAbierta && x.usuarios?.some((u) => u.user.id === user?.id))
      // El Nº que se muestra es el del ciclo abierto (correlativo global), no el registro.
      setMiCaja(propia ? { id: propia.id, numero: propia.sesionAbierta!.numero } : null)
    }).catch(() => {})
    mediosPagoService.listar().then((m) => setMedios(m.filter((x) => x.activo))).catch(() => {})
  }, [pacienteId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const restante = (t: TratNode) => Math.max(0, netoTrat(t) - pagadoTrat(t))
  const accionesTodas = detalles.flatMap((d) => [...d.secciones.flatMap((s) => s.tratamientos), ...d.tratamientos])
  // Mapa acción → plan (para aplicar el abono libre POR plan).
  const planDeTrat = new Map<string, string>()
  for (const d of detalles) for (const t of [...d.secciones.flatMap((s) => s.tratamientos), ...d.tratamientos]) planDeTrat.set(t.id, d.id)
  const sumSelPorPlan = new Map<string, number>()
  for (const [tid, m] of Object.entries(sel)) { const pid = planDeTrat.get(tid); if (pid) sumSelPorPlan.set(pid, (sumSelPorPlan.get(pid) ?? 0) + m) }
  const abonoLibreTotal = detalles.reduce((s, d) => s + (d.abonoLibre ?? 0), 0)
  const sumAcciones = Object.values(sel).reduce((s, n) => s + n, 0)
  // Abono libre como "pie": por plan, min(abono libre del plan, seleccionado de ese plan).
  const creditoPie = usarAbono ? detalles.reduce((s, d) => s + Math.min(d.abonoLibre ?? 0, sumSelPorPlan.get(d.id) ?? 0), 0) : 0
  const nuevoAbono = Number(abono) || 0
  // Total a recaudar (dinero nuevo) = acciones − pie + abono nuevo.
  const totalSel = (sumAcciones - creditoPie) + nuevoAbono
  // Split: monto2 al segundo medio, el resto (monto1) al primero. La suma = totalSel.
  const monto2Num = Math.round(Number(monto2) || 0)
  const splitActivo = dividir && Boolean(medioPago2Id) && monto2Num > 0
  const monto1Num = totalSel - monto2Num
  const splitValido = !splitActivo || (monto2Num > 0 && monto2Num < totalSel && medioPago2Id !== medioPagoId)
  // Deuda = acciones REALIZADAS (completadas) aún impagas (en todos los planes).
  const deuda = accionesTodas.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + restante(t), 0)
  // Grupos de cobro por PLAN → sección (+ "Sin sección"), sólo acciones que restan por pagar.
  const planesConCobro = detalles.map((d) => ({
    plan: d,
    grupos: [
      ...d.secciones.map((s) => ({ id: s.id, titulo: s.titulo || 'Sección', trats: s.tratamientos.filter((t) => restante(t) > 0) })),
      { id: '', titulo: 'Sin sección', trats: d.tratamientos.filter((t) => restante(t) > 0) },
    ].filter((g) => g.trats.length > 0),
  })).filter((p) => p.grupos.length > 0)

  // Al cargar, pre-selecciona las acciones marcadas con el carrito (paraCobro) de todos los planes.
  useEffect(() => {
    if (detalles.length === 0) return
    const pre: Record<string, number> = {}
    for (const t of accionesTodas) if (t.paraCobro && restante(t) > 0) pre[t.id] = restante(t)
    if (Object.keys(pre).length > 0) setSel((s) => ({ ...pre, ...s }))
  }, [detalles]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(t: TratNode) {
    setSel((s) => { const n = { ...s }; if (n[t.id] != null) delete n[t.id]; else n[t.id] = restante(t); return n })
  }
  function toggleSeccion(trats: TratNode[], marcar: boolean) {
    setSel((s) => { const n = { ...s }; for (const t of trats) { if (marcar) n[t.id] = restante(t); else delete n[t.id] } return n })
  }

  async function recaudar() {
    const items: Record<string, unknown>[] = []
    for (const [tid, monto] of Object.entries(sel)) if (monto > 0) {
      const t = accionesTodas.find((a) => a.id === tid)
      items.push({ tratamientoId: tid, descripcion: t?.prestacion.nombre ?? 'Acción', monto })
    }
    if (nuevoAbono > 0) items.push({ planId, descripcion: 'Abono libre al plan', monto: nuevoAbono })
    if (items.length === 0) { setMsg({ t: 'Selecciona acciones o ingresa un abono.', ok: false }); return }
    const usarPie = usarAbono && creditoPie > 0
    // La caja solo se necesita si hay dinero nuevo por recibir (si el abono libre lo cubre todo, no).
    if (totalSel > 0 && !miCaja) { setMsg({ t: 'No tienes una caja abierta. Abre tu caja en Cobros para recibir pagos.', ok: false }); return }
    if (totalSel > 0 && requiereRef && !numeroReferencia.trim()) { setMsg({ t: `Ingresa el N° de referencia de la operación (${medioSel?.nombre}).`, ok: false }); return }
    if (splitActivo && totalSel > 0) {
      if (!splitValido) { setMsg({ t: 'El segundo medio debe ser distinto y su monto menor al total.', ok: false }); return }
      if (requiereRef2 && !numeroReferencia2.trim()) { setMsg({ t: `Ingresa el N° de referencia del segundo medio (${medioSel2?.nombre}).`, ok: false }); return }
    }
    setSaving(true); setMsg(null)
    try {
      const r = await cobrosService.crear({
        pacienteId, cajaId: miCaja?.id, medioPagoId: medioPagoId || undefined, items,
        numeroReferencia: numeroReferencia.trim() || undefined, numeroBoleta: numeroBoleta.trim() || undefined,
        aplicarAbonoLibre: usarPie,
        ...(splitActivo && totalSel > 0 ? { medioPago2Id, monto2: monto2Num, numeroReferencia2: numeroReferencia2.trim() || undefined } : {}),
      }) as { cubiertoConAbono?: boolean; montoAplicado?: number }
      setMsg({ ok: true, t: r?.cubiertoConAbono
        ? `Cubierto con abono libre (${fmtCLP(r.montoAplicado ?? creditoPie)}). No se requirió pago nuevo.`
        : `Recaudación de ${fmtCLP(totalSel)} registrada${usarPie ? ` (abono libre aplicado: ${fmtCLP(creditoPie)})` : ''}.` })
      setSel({}); setAbono(''); setNumeroReferencia(''); setNumeroBoleta('')
      setDividir(false); setMedioPago2Id(''); setMonto2(''); setNumeroReferencia2(''); cargarTodo()
    } catch (e) { setMsg({ t: e instanceof ApiError ? e.message : 'No se pudo recaudar', ok: false }) } finally { setSaving(false) }
  }

  if (planes.length === 0) return <p className="text-sm text-slate-500">Este paciente no tiene planes de tratamiento. Crea un plan con acciones clínicas antes de recaudar.</p>

  return (
    <div className="max-w-2xl space-y-4">
      {abonoLibreTotal > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Abono libre disponible: {fmtCLP(abonoLibreTotal)}</p>
            <p className="text-xs text-emerald-700">Se aplica como pie de las acciones seleccionadas (por su plan).</p>
          </div>
          {planes.length > 1 && (
            <button onClick={() => setDerivar(true)} className="shrink-0 px-3 py-2 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-sm font-semibold rounded-xl">Derivar entre planes</button>
          )}
        </div>
      )}

      {/* Deuda (realizado impago) en todos los planes. */}
      {deuda > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-rose-700">Deuda (realizado impago): {fmtCLP(deuda)}</p>
            <p className="text-xs text-rose-600">Selecciona las acciones en rojo abajo para cobrarlas.</p>
          </div>
          <button onClick={() => { const pend = accionesTodas.filter((t) => t.estado === 'COMPLETADO' && restante(t) > 0); toggleSeccion(pend, true) }}
            className="shrink-0 px-3 py-2 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 text-sm font-semibold rounded-xl">Cobrar toda la deuda</button>
        </div>
      )}

      {planesConCobro.length === 0 ? (
        <p className="text-sm text-slate-500">No hay acciones pendientes de pago en ningún plan de este paciente.</p>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-slate-800">Acciones a cobrar</p>
            <span className="text-xs text-slate-400">De uno o varios planes; el total se suma abajo.</span>
          </div>
          {/* Un card por PLAN; se pueden marcar acciones de varios planes en un solo cobro. */}
          {planesConCobro.map(({ plan, grupos }) => (
            <div key={plan.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 truncate">Plan: {plan.nombre || `#${plan.id.slice(-4)}`}</p>
                {(plan.abonoLibre ?? 0) > 0 && <span className="text-[11px] font-semibold text-emerald-700 shrink-0">Abono libre {fmtCLP(plan.abonoLibre ?? 0)}</span>}
              </div>
              <div className="divide-y divide-slate-100">
                {grupos.map((g) => {
                  const todasSel = g.trats.every((t) => sel[t.id] != null)
                  const subtotal = g.trats.reduce((s, t) => s + (sel[t.id] ?? 0), 0)
                  return (
                    <div key={g.id || 'sin'} className="px-4 py-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer">
                          <input type="checkbox" checked={todasSel} onChange={() => toggleSeccion(g.trats, !todasSel)} /> {g.titulo}
                        </label>
                        {subtotal > 0 && <span className="text-xs font-semibold text-cyan-700 font-mono">{fmtCLP(subtotal)}</span>}
                      </div>
                      <div className="space-y-1">
                        {g.trats.map((t) => {
                          const enDeuda = t.estado === 'COMPLETADO'
                          return (
                            <div key={t.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={sel[t.id] != null} onChange={() => toggle(t)} />
                              <span className={`w-2 h-2 rounded-full shrink-0 ${enDeuda ? 'bg-rose-500' : 'bg-sky-500'}`} title={enDeuda ? 'En deuda (realizada e impaga)' : 'Agregada (aún sin realizar)'} />
                              <span className="flex-1 truncate text-slate-700">{t.prestacion.nombre}{t.diente ? ` · ${t.diente}` : ''}{t.paraCobro ? ' 🛒' : ''}</span>
                              <span className="text-xs text-slate-400 shrink-0">resta {fmtCLP(restante(t))}</span>
                              {sel[t.id] != null && (
                                <input type="number" value={sel[t.id]} onChange={(e) => setSel((s) => ({ ...s, [t.id]: Math.max(0, Math.min(restante(t), Number(e.target.value) || 0)) }))} className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right shrink-0 font-mono" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-1">Abono libre a un plan</p>
            <p className="text-xs text-slate-400 mb-2">Un monto que queda abonado al plan elegido, sin asociarlo a una acción específica.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="number" value={abono} onChange={(e) => setAbono(e.target.value)} placeholder="Monto" className="w-40 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
              {planes.length > 1 && (
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm max-w-[220px]">
                  {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre || `#${p.id.slice(-4)}`}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Caja</span>
                {miCaja ? (
                  <div className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Caja N° {miCaja.numero} <span className="text-slate-400">· tu caja</span>
                  </div>
                ) : (
                  <div className="mt-1 w-full px-3 py-2 border border-amber-200 bg-amber-50 rounded-lg text-xs text-amber-700">
                    No tienes una caja abierta. <Link to="/cobros" className="font-semibold underline">Abre tu caja</Link> para recibir pagos.
                  </div>
                )}
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Medio de pago</span>
                <select value={medioPagoId} onChange={(e) => setMedioPagoId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="">Efectivo / sin comisión</option>
                  {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.comision ? ` (${m.comision}%)` : ''}</option>)}
                </select>
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {requiereRef && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">N° de referencia de la operación *</span>
                  <input value={numeroReferencia} onChange={(e) => setNumeroReferencia(e.target.value)} placeholder="Obligatorio para tarjeta"
                    className="mt-1 w-full px-3 py-2 border border-cyan-300 bg-cyan-50/40 rounded-lg text-sm" />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-slate-500">N° de boleta (opcional)</span>
                <input value={numeroBoleta} onChange={(e) => setNumeroBoleta(e.target.value)} placeholder="N° de boleta"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </label>
            </div>

            {/* Segundo medio de pago (pago dividido). El monto2 va al 2do medio; el resto al 1ro. */}
            {!dividir ? (
              <button type="button" onClick={() => { setDividir(true); if (totalSel > 0) setMonto2(String(Math.floor(totalSel / 2))) }}
                disabled={totalSel <= 0}
                className="text-xs font-semibold text-cyan-700 hover:text-cyan-800 disabled:opacity-40">+ Agregar segundo medio de pago</button>
            ) : (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Segundo medio de pago (pago dividido)</span>
                  <button type="button" onClick={() => { setDividir(false); setMedioPago2Id(''); setMonto2(''); setNumeroReferencia2('') }} className="text-xs text-slate-400 hover:text-rose-600">Quitar</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">2do medio</span>
                    <select value={medioPago2Id} onChange={(e) => setMedioPago2Id(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      <option value="">Efectivo / sin comisión</option>
                      {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.comision ? ` (${m.comision}%)` : ''}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Monto en el 2do medio</span>
                    <input type="number" min={1} value={monto2} onChange={(e) => setMonto2(e.target.value)} placeholder="0"
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
                  </label>
                </div>
                {requiereRef2 && (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">N° de referencia del 2do medio *</span>
                    <input value={numeroReferencia2} onChange={(e) => setNumeroReferencia2(e.target.value)} placeholder="Obligatorio para tarjeta"
                      className="mt-1 w-full px-3 py-2 border border-cyan-300 bg-cyan-50/40 rounded-lg text-sm" />
                  </label>
                )}
                <div className="text-xs text-slate-600 flex items-center justify-between">
                  <span>{medioSel?.nombre ?? 'Efectivo'}: <span className="font-mono font-semibold">{fmtCLP(Math.max(0, monto1Num))}</span></span>
                  <span>{medioSel2?.nombre ?? 'Efectivo'}: <span className="font-mono font-semibold">{fmtCLP(monto2Num)}</span></span>
                </div>
                {splitActivo && !splitValido && <p className="text-[11px] text-rose-600">El 2do medio debe ser distinto del 1ro y su monto menor al total ({fmtCLP(totalSel)}).</p>}
              </div>
            )}

            {/* Abono libre como "pie": se descuenta automáticamente de las acciones seleccionadas. */}
            {abonoLibreTotal > 0 && sumAcciones > 0 && (
              <label className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                <span className="flex items-center gap-2 text-xs text-emerald-800">
                  <input type="checkbox" checked={usarAbono} onChange={(e) => setUsarAbono(e.target.checked)} />
                  Usar abono libre como pie ({fmtCLP(abonoLibreTotal)} disponible)
                </span>
                {usarAbono && <span className="text-xs font-semibold text-emerald-700">− {fmtCLP(creditoPie)}</span>}
              </label>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Total a recaudar</span>
              <span className="text-lg font-bold text-cyan-700">{fmtCLP(totalSel)}</span>
            </div>
            {usarAbono && creditoPie > 0 && totalSel === 0 && <p className="text-[11px] text-emerald-700">Se cubre por completo con el abono libre; no se requiere pago nuevo.</p>}
            <button onClick={recaudar} disabled={saving || (sumAcciones <= 0 && nuevoAbono <= 0) || (totalSel > 0 && requiereRef && !numeroReferencia.trim()) || (splitActivo && totalSel > 0 && (!splitValido || (requiereRef2 && !numeroReferencia2.trim())))} className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">{saving ? 'Registrando…' : 'Recaudar'}</button>
            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
            <p className="text-[11px] text-slate-400">La caja debe estar abierta (ábrela en Cobros si hace falta).</p>
          </div>
        </>
      )}

      {derivar && (
        <DerivarAbonoModal fromPlanId={planId} disponible={detalles.find((d) => d.id === planId)?.abonoLibre ?? 0}
          planes={planes.filter((p) => p.id !== planId)}
          onClose={() => setDerivar(false)}
          onDone={(t) => { setDerivar(false); setMsg({ t, ok: true }); cargarTodo() }}
          onError={(t) => setMsg({ t, ok: false })} />
      )}
    </div>
  )
}

// Modal: derivar el abono libre de un plan a otro plan del mismo paciente.
function DerivarAbonoModal({ fromPlanId, disponible, planes, onClose, onDone, onError }: {
  fromPlanId: string; disponible: number; planes: PlanCard[]
  onClose: () => void; onDone: (msg: string) => void; onError: (msg: string) => void
}) {
  const [toPlanId, setToPlanId] = useState(planes[0]?.id ?? '')
  const [monto, setMonto] = useState(String(Math.round(disponible)))
  const [g, setG] = useState(false)
  async function guardar() {
    const m = Number(monto)
    if (!toPlanId) { onError('Selecciona el plan de destino.'); return }
    if (!(m > 0) || m > disponible) { onError('Monto inválido (no puede superar el abono disponible).'); return }
    setG(true)
    try {
      await cobrosService.derivarAbono({ fromPlanId, toPlanId, monto: m })
      onDone(`Se derivaron ${fmtCLP(m)} al otro plan.`)
    } catch (e) { onError(e instanceof ApiError ? e.message : 'No se pudo derivar') } finally { setG(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Derivar abono a otro plan</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <p className="text-sm text-slate-600 mb-3">Abono disponible: <span className="font-mono font-semibold">{fmtCLP(disponible)}</span></p>
        <label className="block mb-3">
          <span className="text-xs font-medium text-slate-500">Plan de destino</span>
          <select value={toPlanId} onChange={(e) => setToPlanId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
            {planes.length === 0 && <option value="">No hay otros planes</option>}
            {planes.map((p) => <option key={p.id} value={p.id}>#{p.id.slice(-4)} · {p.nombre}</option>)}
          </select>
        </label>
        <label className="block mb-1">
          <span className="text-xs font-medium text-slate-500">Monto a derivar</span>
          <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
        </label>
        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={guardar} disabled={g || planes.length === 0} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? '…' : 'Derivar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Evoluciones ──
interface Evo {
  id: string; texto: string; fecha?: string; createdAt: string
  autor?: { name: string | null; username: string | null }
  tratamiento?: { prestacion?: { nombre: string }; diente: number | null } | null
}

function EvolucionesTab({ pacienteId, isAdmin }: { pacienteId: string; isAdmin: boolean }) {
  const [evos, setEvos] = useState<Evo[]>([])
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = () => evolucionesService.listar(pacienteId).then((e) => setEvos(e as Evo[]))
  useEffect(() => { cargar() }, [pacienteId])
  async function agregar() {
    if (!texto.trim()) return
    setGuardando(true)
    try { await evolucionesService.crear({ pacienteId, texto: texto.trim() }); setTexto(''); cargar() } finally { setGuardando(false) }
  }
  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar esta evolución de la ficha clínica? Queda registrada en el historial de auditoría.')) return
    try { await evolucionesService.eliminar(id) } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
    cargar()
  }
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Nueva evolución clínica…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={agregar} disabled={guardando || !texto.trim()} className="mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Agregar</button>
      </div>
      <div className="space-y-3">
        {evos.map((e) => <EvolucionItem key={e.id} e={e} isAdmin={isAdmin} onChanged={cargar} onBorrar={() => borrar(e.id)} />)}
        {evos.length === 0 && <p className="text-sm text-slate-500">Sin evoluciones registradas.</p>}
      </div>
    </div>
  )
}

function EvolucionItem({ e, isAdmin, onChanged, onBorrar }: { e: Evo; isAdmin: boolean; onChanged: () => void; onBorrar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(e.texto)
  const fecha = e.fecha ?? e.createdAt
  async function guardar() {
    if (!txt.trim()) return
    try { await evolucionesService.actualizar(e.id, txt.trim()) } catch (err) { alert(err instanceof ApiError ? err.message : 'Error'); return }
    setEditando(false); onChanged()
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      {editando ? (
        <div>
          <textarea value={txt} onChange={(ev) => setTxt(ev.target.value)} rows={4} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <div className="flex gap-2 mt-2">
            <button onClick={guardar} className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg">Guardar</button>
            <button onClick={() => { setEditando(false); setTxt(e.texto) }} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.texto}</p>
          {e.tratamiento?.prestacion?.nombre && (
            <p className="text-xs text-cyan-700 mt-1">{e.tratamiento.prestacion.nombre}{e.tratamiento.diente ? ` · pieza ${e.tratamiento.diente}` : ''}</p>
          )}
          <div className="flex items-center justify-between mt-2 gap-2">
            <p className="text-xs text-slate-400">{e.autor?.name ?? e.autor?.username ?? 'Sistema'} · {new Date(fecha).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            {isAdmin && (
              <div className="flex gap-3 shrink-0">
                <button onClick={() => setEditando(true)} className="text-xs text-slate-400 hover:text-cyan-600">Editar</button>
                <button onClick={onBorrar} className="text-xs text-slate-400 hover:text-rose-600">Eliminar</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Historial / trazabilidad de la ficha clínica ──
interface PagoPaciente {
  id: string; numero: number; monto: number; estado: string; anulado: boolean
  fechaPago: string | null; concepto: string
  numeroReferencia?: string | null; numeroBoleta?: string | null
  medioPago?: { nombre: string } | null
  reciboUsuario?: { name: string | null } | null
}

function HistorialTab({ pacienteId }: { pacienteId: string }) {
  const [items, setItems] = useState<HistorialEntry[]>([])
  const [pagos, setPagos] = useState<PagoPaciente[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    Promise.all([
      historialService.listar(pacienteId).then(setItems).catch(() => {}),
      cobrosService.porPaciente(pacienteId).then((c) => setPagos(c as PagoPaciente[])).catch(() => {}),
    ]).finally(() => setCargando(false))
  }, [pacienteId])
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  const ACC: Record<string, { l: string; c: string }> = {
    CREAR: { l: 'Creó', c: 'bg-emerald-50 text-emerald-700' },
    EDITAR: { l: 'Editó', c: 'bg-amber-50 text-amber-700' },
    EVOLUCIONAR: { l: 'Evolucionó', c: 'bg-cyan-50 text-cyan-700' },
    ELIMINAR: { l: 'Eliminó', c: 'bg-rose-50 text-rose-700' },
    ACCESO: { l: 'Accedió', c: 'bg-slate-100 text-slate-600' },
  }
  return (
    <div className="space-y-6">
      {/* Pagos recibidos */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Pagos recibidos</h3>
        {pagos.length === 0 ? <p className="text-sm text-slate-500">Sin pagos registrados.</p> : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {pagos.map((p) => (
              <div key={p.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${p.anulado ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-medium text-slate-800 truncate ${p.anulado ? 'line-through' : ''}`}>
                    #{p.numero} · {fmtCLP(p.monto)}
                    <span className="ml-2 text-xs font-normal text-slate-500">{p.medioPago?.nombre ?? 'Efectivo'}</span>
                    {p.anulado && <span className="ml-2 text-[11px] font-semibold text-rose-600">ANULADO</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{p.concepto}</p>
                  {(p.numeroReferencia || p.numeroBoleta) && (
                    <p className="text-xs text-slate-500">
                      {p.numeroReferencia ? `Ref: ${p.numeroReferencia}` : ''}{p.numeroReferencia && p.numeroBoleta ? ' · ' : ''}{p.numeroBoleta ? `Boleta: ${p.numeroBoleta}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {p.fechaPago ? new Date(p.fechaPago).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    {p.reciboUsuario?.name ? ` · recibió ${p.reciboUsuario.name}` : ''}
                  </p>
                </div>
                {!p.anulado && p.estado === 'PAGADO' && (
                  <a href={`/print/cobro/${p.id}`} target="_blank" rel="noopener noreferrer" title="Imprimir comprobante"
                    className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800">🖨 Imprimir</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
      <p className="text-xs text-slate-500 mb-3">Trazabilidad de la ficha clínica: quién hizo qué y cuándo. Registro inmutable, conforme a la normativa de fichas clínicas (Ley 20.584 / Ley 21.719).</p>
      {items.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos registrados aún.</p> : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {items.map((h) => {
            const a = ACC[h.accion] ?? { l: h.accion, c: 'bg-slate-100 text-slate-600' }
            return (
              <div key={h.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${a.c}`}>{a.l}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">{h.resumen}</p>
                  <p className="text-xs text-slate-400">{h.userNombre ?? 'Sistema'} · {new Date(h.fecha).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}

function In({ label, v, on }: { label: string; v: string; on: (x: string) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
