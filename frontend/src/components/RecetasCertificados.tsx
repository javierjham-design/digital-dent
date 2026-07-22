import { useEffect, useRef, useState, type ReactNode } from 'react'
import { consentimientosService, type PlantillaConsentimiento, type ConsentimientoResumen, type Consentimiento } from '@/services/consentimientos.service'
import { usuariosService } from '@/services/equipo.service'
import type { DoctorDTO } from '@shared/types'
import { clinicaService } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'
import { DocumentoConsentimiento, descargarConsentimientoPDF } from '@/components/DocumentoConsentimiento'
import { EnviarCorreoModal } from '@/components/EnviarCorreoModal'
import { elementoAPdfBase64 } from '@/lib/pdf'
import { useAuth } from '@/hooks/useAuth'

type Clinica = { nombre?: string; logoUrl?: string | null; direccion?: string; ciudad?: string }
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)

// Etiqueta e ícono por categoría de documento.
const CAT: Record<string, { l: string; icon: string }> = {
  RECETA: { l: 'Receta', icon: '℞' },
  CERTIFICADO: { l: 'Certificado', icon: '📃' },
  INDICACION: { l: 'Indicaciones', icon: '📋' },
  OTRO: { l: 'Documento', icon: '📄' },
}
const catDe = (c?: string) => CAT[c ?? 'OTRO'] ?? CAT.OTRO

// Generador de recetas médicas, certificados e indicaciones (y documentos
// personalizados que la clínica configure). Reutiliza el motor de plantillas de
// consentimientos, pero sin exigir plan ni firma del paciente.
export function RecetasCertificados({ pacienteId, pacienteNombre, pacienteEmail }: { pacienteId: string; pacienteNombre: string; pacienteEmail?: string | null }) {
  const { user } = useAuth()
  const puedeEliminar = Boolean(user?.permisos?.puedeEliminar)
  const [clinica, setClinica] = useState<Clinica | null>(null)
  const [plantillas, setPlantillas] = useState<PlantillaConsentimiento[]>([])
  const [lista, setLista] = useState<ConsentimientoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [gen, setGen] = useState(false)
  const [ver, setVer] = useState<Consentimiento | null>(null)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargarLista = () => consentimientosService.porPaciente(pacienteId, 'DOCUMENTO').then(setLista).catch(() => {})
  useEffect(() => {
    Promise.all([
      clinicaService.obtener().then(setClinica).catch(() => {}),
      consentimientosService.plantillas(true, 'DOCUMENTO').then(setPlantillas).catch(() => {}),
      cargarLista(),
    ]).finally(() => setCargando(false))
  }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este documento? Queda registrado en la auditoría.')) return
    try { await consentimientosService.eliminar(id); setVer(null); cargarLista(); notify('Documento eliminado') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <div>
      {aviso && <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm text-slate-500">Genera recetas, certificados e indicaciones para el paciente. Los formatos base se configuran en <span className="font-medium">Administración › Recetas y documentos</span>.</p>
        <button onClick={() => setGen(true)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl shrink-0">Generar documento</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Cargando…</p>
          : lista.length === 0 ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Sin recetas ni certificados generados aún.</p>
          : lista.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <button onClick={() => consentimientosService.obtener(c.id).then(setVer).catch(() => {})} className="min-w-0 text-left flex-1">
                <p className="font-medium text-slate-800 truncate">{catDe(c.categoria).icon} {c.titulo}</p>
                <p className="text-xs text-slate-500">{catDe(c.categoria).l} · {fecha(c.createdAt)}{c.responsableNombre ? ` · Dr(a). ${c.responsableNombre}` : ''}</p>
              </button>
              <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{c.codigo}</span>
            </div>
          ))}
      </div>

      {gen && <GenerarModal pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} plantillas={plantillas} clinica={clinica}
        onClose={() => setGen(false)} onDone={() => { setGen(false); cargarLista() }} notify={notify} />}
      {ver && <VerModal doc={ver} clinica={clinica} pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} puedeEliminar={puedeEliminar}
        onClose={() => setVer(null)} onEliminar={() => eliminar(ver.id)} notify={notify} />}
    </div>
  )
}

function GenerarModal({ pacienteId, pacienteNombre, pacienteEmail, plantillas, clinica, onClose, onDone, notify }: {
  pacienteId: string; pacienteNombre: string; pacienteEmail?: string | null; plantillas: PlantillaConsentimiento[]; clinica: Clinica | null
  onClose: () => void; onDone: () => void; notify: (t: string, ok?: boolean) => void
}) {
  const [plantillaId, setPlantillaId] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [prev, setPrev] = useState<{ faltantes: string[]; html: string; manuales: { name: string; label: string }[] } | null>(null)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [generado, setGenerado] = useState<Consentimiento | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { usuariosService.doctores().then(setDoctores).catch(() => {}) }, [])

  useEffect(() => {
    setExtra({})
    if (!plantillaId) { setPrev(null); return }
    consentimientosService.previsualizar(pacienteId, plantillaId, responsableId || undefined).then(setPrev).catch(() => setPrev(null))
  }, [plantillaId, pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plantillaId) return
    const t = setTimeout(() => { consentimientosService.previsualizar(pacienteId, plantillaId, responsableId || undefined, extra).then(setPrev).catch(() => {}) }, 350)
    return () => clearTimeout(t)
  }, [extra, responsableId, plantillaId, pacienteId])

  async function generar() {
    if (!responsableId) { notify('Selecciona el profesional que emite', false); return }
    setBusy(true)
    try { const c = await consentimientosService.generar(pacienteId, plantillaId, responsableId, '', extra); setGenerado(c); notify('Documento generado') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'No se pudo generar', false) } finally { setBusy(false) }
  }

  if (generado) return <VerModal doc={generado} clinica={clinica} pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} puedeEliminar={false} onClose={onDone} onEliminar={() => {}} notify={notify} reciénGenerado />

  const bloqueado = !prev || prev.faltantes.length > 0 || !responsableId || !plantillaId
  return (
    <Modal title="Generar documento" onClose={onClose} ancho="max-w-3xl">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="block"><span className="text-xs font-medium text-slate-500">Documento</span>
          <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} className={inp}>
            <option value="">Selecciona un formato…</option>
            {plantillas.map((p) => <option key={p.id} value={p.id}>{catDe(p.categoria).l} · {p.titulo}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-xs font-medium text-slate-500">Profesional que emite <span className="text-rose-500">*</span></span>
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={inp}>
            <option value="">Selecciona un profesional…</option>
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}{d.especialidad ? ` · ${d.especialidad}` : ''}</option>)}
          </select>
        </label>
      </div>

      {prev && prev.faltantes.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 mb-3 text-sm">
          ⚠️ Faltan datos del paciente: <span className="font-semibold">{prev.faltantes.join(', ')}</span>. Complétalos en la pestaña <span className="font-semibold">Datos</span>.
        </div>
      )}

      {prev && prev.manuales.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Contenido del documento <span className="text-slate-400">(se imprime en cursiva; deja vacío lo que no aplique)</span></p>
          <div className="grid gap-2">
            {prev.manuales.map((v) => (
              <textarea key={v.name} value={extra[v.name] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [v.name]: e.target.value }))} placeholder={v.label} rows={2} className={inp} />
            ))}
          </div>
        </div>
      )}

      {prev && (
        <div className="border border-slate-200 rounded-xl max-h-[45vh] overflow-y-auto p-3 mb-4 bg-slate-50">
          <DocumentoConsentimiento html={prev.html} clinica={clinica ?? undefined} />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button onClick={generar} disabled={bloqueado || busy} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Generando…' : 'Generar'}</button>
      </div>
    </Modal>
  )
}

// Vista de un documento generado: descargar PDF / imprimir / enviar por correo.
function VerModal({ doc, clinica, pacienteId, pacienteNombre, pacienteEmail, puedeEliminar, onClose, onEliminar, notify, reciénGenerado }: {
  doc: Consentimiento; clinica: Clinica | null; pacienteId?: string; pacienteNombre: string; pacienteEmail?: string | null; puedeEliminar: boolean
  onClose: () => void; onEliminar: () => void; notify: (t: string, ok?: boolean) => void; reciénGenerado?: boolean
}) {
  const docRef = useRef<HTMLDivElement>(null)
  const [enviar, setEnviar] = useState(false)
  const nombrePdf = `${slug(doc.titulo)}_${slug(pacienteNombre)}.pdf`

  async function descargar() {
    if (!docRef.current) return
    try { await descargarConsentimientoPDF(docRef.current, nombrePdf) } catch { notify('No se pudo generar el PDF', false) }
  }
  function imprimir() {
    const cont = docRef.current; if (!cont) return
    const w = window.open('', '_blank', 'width=820,height=1000'); if (!w) return
    w.document.write(`<!doctype html><html><head><title>${doc.titulo}</title><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#0f172a} h1{font-size:18px} h3{font-size:14px;margin:12px 0 4px} p{margin:4px 0} ul{margin:4px 0 4px 20px} em{font-style:italic}</style></head><body>${cont.innerHTML}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => { w.print() }, 300)
  }

  return (
    <Modal title={reciénGenerado ? 'Documento generado' : doc.titulo} onClose={onClose} ancho="max-w-3xl">
      <div className="border border-slate-200 rounded-xl max-h-[55vh] overflow-y-auto p-3 mb-4 bg-slate-50">
        <DocumentoConsentimiento ref={docRef} html={doc.contenidoHtml} clinica={clinica ?? undefined} />
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <button onClick={imprimir} className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold">🖨 Imprimir</button>
        <button onClick={descargar} className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Descargar PDF</button>
        <button onClick={() => setEnviar(true)} className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">✉ Enviar por correo</button>
      </div>
      {puedeEliminar && !reciénGenerado && (
        <button onClick={onEliminar} className="mt-3 w-full text-xs font-semibold text-rose-600 hover:text-rose-800">Eliminar documento</button>
      )}

      {enviar && (
        <EnviarCorreoModal
          tipo="DOCUMENTO" titulo={doc.titulo}
          asuntoDefault={`${doc.titulo} · ${clinica?.nombre ?? ''}`.trim()}
          pacienteId={pacienteId} pacienteNombre={pacienteNombre} defaultEmail={pacienteEmail}
          generarPdf={async () => ({ base64: await elementoAPdfBase64(docRef.current as HTMLElement), nombre: nombrePdf })}
          onClose={() => setEnviar(false)} onSent={() => notify('Documento enviado por correo')} />
      )}
    </Modal>
  )
}

const inp = 'w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
function Modal({ title, children, onClose, ancho = 'max-w-lg' }: { title: string; children: ReactNode; onClose: () => void; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${ancho} max-h-[92vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>
        {children}
      </div>
    </div>
  )
}
