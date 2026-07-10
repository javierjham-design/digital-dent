import { useEffect, useRef, useState, type ReactNode } from 'react'
import { consentimientosService, type PlantillaConsentimiento, type ConsentimientoResumen, type Consentimiento } from '@/services/consentimientos.service'
import { clinicaService } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'
import { DocumentoConsentimiento, descargarConsentimientoPDF } from '@/components/DocumentoConsentimiento'
import { SignaturePad } from '@/components/SignaturePad'
import { EnviarCorreoModal } from '@/components/EnviarCorreoModal'
import { elementoAPdfBase64 } from '@/lib/pdf'
import { useAuth } from '@/hooks/useAuth'

type Clinica = { nombre?: string; logoUrl?: string | null; direccion?: string; ciudad?: string }
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)

export function ConsentimientosPaciente({ pacienteId, pacienteNombre, pacienteEmail }: { pacienteId: string; pacienteNombre: string; pacienteEmail?: string | null }) {
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

  const cargarLista = () => consentimientosService.porPaciente(pacienteId).then(setLista).catch(() => {})
  useEffect(() => {
    Promise.all([
      clinicaService.obtener().then(setClinica).catch(() => {}),
      consentimientosService.plantillas(true).then(setPlantillas).catch(() => {}),
      cargarLista(),
    ]).finally(() => setCargando(false))
  }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este consentimiento? Esta acción queda registrada en la auditoría.')) return
    try { await consentimientosService.eliminar(id); setVer(null); cargarLista(); notify('Consentimiento eliminado') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <div>
      {aviso && <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm text-slate-500">Genera, firma y archiva los consentimientos informados del paciente.</p>
        <button onClick={() => setGen(true)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl shrink-0">Generar consentimiento informado</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Cargando…</p>
          : lista.length === 0 ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Sin consentimientos aún.</p>
          : lista.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <button onClick={() => consentimientosService.obtener(c.id).then(setVer).catch(() => {})} className="min-w-0 text-left flex-1">
                <p className="font-medium text-slate-800 truncate">{c.titulo}</p>
                <p className="text-xs text-slate-500">{c.codigo} · {fecha(c.createdAt)}{c.generadoPorNombre ? ` · ${c.generadoPorNombre}` : ''}</p>
              </button>
              <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${c.estado === 'FIRMADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {c.estado === 'FIRMADO' ? `Firmado${c.firmaTipo === 'DIGITAL' ? ' · digital' : ''}` : 'Borrador'}
              </span>
            </div>
          ))}
      </div>

      {gen && <GenerarModal pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} plantillas={plantillas} clinica={clinica}
        onClose={() => setGen(false)} onDone={() => { setGen(false); cargarLista() }} notify={notify} />}
      {ver && <VerModal consent={ver} clinica={clinica} pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} puedeEliminar={puedeEliminar}
        onClose={() => setVer(null)} onChanged={(c) => { setVer(c); cargarLista() }} onEliminar={() => eliminar(ver.id)} notify={notify} />}
    </div>
  )
}

// ── Modal: generar ────────────────────────────────────────────────────────────
function GenerarModal({ pacienteId, pacienteNombre, pacienteEmail, plantillas, clinica, onClose, onDone, notify }: {
  pacienteId: string; pacienteNombre: string; pacienteEmail?: string | null; plantillas: PlantillaConsentimiento[]; clinica: Clinica | null
  onClose: () => void; onDone: () => void; notify: (t: string, ok?: boolean) => void
}) {
  const [plantillaId, setPlantillaId] = useState('')
  const [prev, setPrev] = useState<{ faltantes: string[]; html: string; manuales: { name: string; label: string }[] } | null>(null)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [generado, setGenerado] = useState<Consentimiento | null>(null)
  const [busy, setBusy] = useState(false)

  // Al cambiar de plantilla: reinicia los campos manuales y previsualiza.
  useEffect(() => {
    setExtra({})
    if (!plantillaId) { setPrev(null); return }
    consentimientosService.previsualizar(pacienteId, plantillaId).then(setPrev).catch(() => setPrev(null))
  }, [plantillaId, pacienteId])

  // Al escribir en los campos manuales: re-previsualiza (debounced) para reflejar en la vista previa.
  useEffect(() => {
    if (!plantillaId) return
    const t = setTimeout(() => { consentimientosService.previsualizar(pacienteId, plantillaId, extra).then(setPrev).catch(() => {}) }, 350)
    return () => clearTimeout(t)
  }, [extra, plantillaId, pacienteId])

  async function generar() {
    setBusy(true)
    try { const c = await consentimientosService.generar(pacienteId, plantillaId, extra); setGenerado(c); notify('Consentimiento generado') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'No se pudo generar', false) } finally { setBusy(false) }
  }

  if (generado) return <FirmarView consent={generado} clinica={clinica} pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} onClose={onDone} onChanged={setGenerado} notify={notify} />

  const bloqueado = !prev || prev.faltantes.length > 0
  return (
    <Modal title="Generar consentimiento informado" onClose={onClose} ancho="max-w-3xl">
      <label className="block mb-3"><span className="text-xs font-medium text-slate-500">Formato</span>
        <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} className={inp}>
          <option value="">Selecciona un consentimiento…</option>
          {plantillas.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
      </label>

      {prev && prev.faltantes.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 mb-3 text-sm">
          ⚠️ Faltan datos del paciente para este consentimiento: <span className="font-semibold">{prev.faltantes.join(', ')}</span>.
          Complétalos en la pestaña <span className="font-semibold">Datos</span> y vuelve a intentar.
        </div>
      )}

      {prev && prev.manuales.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Datos del procedimiento <span className="text-slate-400">(se imprimen en cursiva; deja vacío lo que no aplique)</span></p>
          <div className="grid sm:grid-cols-2 gap-2">
            {prev.manuales.map((v) => (
              <input key={v.name} value={extra[v.name] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [v.name]: e.target.value }))} placeholder={v.label} className={inp} />
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

// ── Vista de firma / descarga (recién generado o al abrir un borrador) ─────────
function FirmarView({ consent, clinica, pacienteId, pacienteNombre, pacienteEmail, onClose, onChanged, notify }: {
  consent: Consentimiento; clinica: Clinica | null; pacienteId?: string; pacienteNombre: string; pacienteEmail?: string | null
  onClose: () => void; onChanged: (c: Consentimiento) => void; notify: (t: string, ok?: boolean) => void
}) {
  const docRef = useRef<HTMLDivElement>(null)
  const [modoFirma, setModoFirma] = useState<null | 'digital'>(null)
  const [firmaImg, setFirmaImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [enviar, setEnviar] = useState(false)
  const firmado = consent.estado === 'FIRMADO'
  const nombrePdf = `Consentimiento_${consent.codigo}_${slug(pacienteNombre)}.pdf`

  async function descargar() {
    if (!docRef.current) return
    try { await descargarConsentimientoPDF(docRef.current, nombrePdf) }
    catch { notify('No se pudo generar el PDF', false) }
  }
  async function firmar(tipo: 'MANUAL' | 'DIGITAL') {
    if (tipo === 'DIGITAL' && !firmaImg) { notify('Firma en el recuadro primero', false); return }
    setBusy(true)
    try { const c = await consentimientosService.firmar(consent.id, { tipo, imagen: firmaImg ?? undefined }); onChanged(c); setModoFirma(null); notify('Consentimiento firmado') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error al firmar', false) } finally { setBusy(false) }
  }

  return (
    <Modal title={firmado ? 'Consentimiento firmado' : 'Firmar / descargar consentimiento'} onClose={onClose} ancho="max-w-3xl">
      <div className="border border-slate-200 rounded-xl max-h-[50vh] overflow-y-auto p-3 mb-4 bg-slate-50">
        <DocumentoConsentimiento ref={docRef} html={consent.contenidoHtml} clinica={clinica ?? undefined} />
      </div>

      {!firmado && modoFirma === 'digital' && (
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Firma del paciente</p>
          <SignaturePad onChange={setFirmaImg} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setModoFirma(null)} className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm">Volver</button>
            <button onClick={() => firmar('DIGITAL')} disabled={!firmaImg || busy} className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Firmando…' : 'Confirmar firma digital'}</button>
          </div>
        </div>
      )}

      {!firmado && modoFirma === null && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <button onClick={() => setModoFirma('digital')} className="px-3 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Firmar digital</button>
          <button onClick={() => firmar('MANUAL')} disabled={busy} className="px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">Firma manual</button>
          <button onClick={descargar} className="px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">Descargar PDF</button>
          <button onClick={() => setEnviar(true)} className="px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">✉ Enviar por correo</button>
        </div>
      )}

      {firmado && (
        <div className="grid sm:grid-cols-3 gap-2">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
          <button onClick={descargar} className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-semibold">Descargar PDF</button>
          <button onClick={() => setEnviar(true)} className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium">✉ Enviar por correo</button>
        </div>
      )}

      {enviar && (
        <EnviarCorreoModal
          tipo="CONSENTIMIENTO" titulo="consentimiento"
          asuntoDefault={`Consentimiento informado · ${clinica?.nombre ?? ''}`.trim()}
          pacienteId={pacienteId} pacienteNombre={pacienteNombre} defaultEmail={pacienteEmail}
          generarPdf={async () => ({ base64: await elementoAPdfBase64(docRef.current as HTMLElement), nombre: nombrePdf })}
          onClose={() => setEnviar(false)} onSent={() => notify('Consentimiento enviado por correo')} />
      )}
    </Modal>
  )
}

// ── Ver un consentimiento existente ───────────────────────────────────────────
function VerModal({ consent, clinica, pacienteId, pacienteNombre, pacienteEmail, puedeEliminar, onClose, onChanged, onEliminar, notify }: {
  consent: Consentimiento; clinica: Clinica | null; pacienteId?: string; pacienteNombre: string; pacienteEmail?: string | null; puedeEliminar: boolean
  onClose: () => void; onChanged: (c: Consentimiento) => void; onEliminar: () => void; notify: (t: string, ok?: boolean) => void
}) {
  return (
    <div>
      <FirmarView consent={consent} clinica={clinica} pacienteId={pacienteId} pacienteNombre={pacienteNombre} pacienteEmail={pacienteEmail} onClose={onClose} onChanged={onChanged} notify={notify} />
      {puedeEliminar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
          <button onClick={onEliminar} className="px-4 py-2 bg-white border border-rose-200 text-rose-600 text-sm font-semibold rounded-xl shadow-lg hover:bg-rose-50">Eliminar consentimiento</button>
        </div>
      )}
    </div>
  )
}

// ── UI helpers ────────────────────────────────────────────────────────────────
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
