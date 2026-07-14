import { useEffect, useRef, useState } from 'react'
import { consentimientosService, type PlantillaConsentimiento } from '@/services/consentimientos.service'
import { ApiError } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'

const CAMPOS: [string, string][] = [
  ['nombre', 'Nombre y apellido'], ['rut', 'Documento (RUT/cédula)'], ['fechaNacimiento', 'Fecha de nacimiento'],
  ['telefono', 'Teléfono'], ['email', 'Email'], ['direccion', 'Dirección'], ['apoderado', 'Representante / apoderado'],
]
const VARIABLES = ['PACIENTE_NOMBRE_COMPLETO', 'PACIENTE_RUT', 'PACIENTE_FECHA_NACIMIENTO', 'PACIENTE_EDAD', 'PACIENTE_TELEFONO_CORREO', 'FICHA_CLINICA_N', 'REPRESENTANTE_NOMBRE', 'REPRESENTANTE_RUT_VINCULO', 'PROFESIONAL_NOMBRE', 'PROFESIONAL_RUT_REGISTRO', 'FECHA_HORA']

export function Consentimientos() {
  const { user } = useAuth()
  const puedeConfig = user?.role === 'admin' || Boolean(user?.permisos?.puedeConfigurarClinica)
  const [lista, setLista] = useState<PlantillaConsentimiento[]>([])
  const [sel, setSel] = useState<PlantillaConsentimiento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargar = () => consentimientosService.plantillas().then(setLista).catch(() => {}).finally(() => setCargando(false))
  useEffect(() => { cargar() }, [])

  async function nueva() {
    try { const p = await consentimientosService.crearPlantilla({ titulo: 'Nuevo consentimiento', codigo: 'CI', contenidoHtml: '<h1>Nuevo consentimiento</h1><p>Contenido…</p>' }); cargar(); setSel(p); notify('Plantilla creada') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  if (!puedeConfig) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso a las plantillas de consentimientos. Pídele a un administrador el permiso <span className="font-medium">“Configurar la clínica”</span>.</p>

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">Consentimientos informados</h1>
        <button onClick={nueva} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nueva plantilla</button>
      </div>
      <p className="text-sm text-slate-500 mb-5">Formatos base precargados (editables). Se generan desde la ficha del paciente. La eliminación de un consentimiento generado requiere administrador.</p>
      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Cargando…</p>
          : lista.map((p) => (
            <button key={p.id} onClick={() => setSel(p)} className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 text-left">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{p.titulo}</p>
                <p className="text-xs text-slate-500">{p.codigo} · v{p.version}</p>
              </div>
              <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${p.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.activo ? 'Activa' : 'Inactiva'}</span>
            </button>
          ))}
      </div>

      {sel && <EditorModal key={sel.id} plantilla={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); cargar() }} notify={notify} />}
    </div>
  )
}

function EditorModal({ plantilla, onClose, onSaved, notify }: { plantilla: PlantillaConsentimiento; onClose: () => void; onSaved: () => void; notify: (t: string, ok?: boolean) => void }) {
  const [titulo, setTitulo] = useState(plantilla.titulo)
  const [codigo, setCodigo] = useState(plantilla.codigo)
  const [activo, setActivo] = useState(plantilla.activo)
  const [req, setReq] = useState<string[]>(plantilla.camposRequeridos.split(',').map((s) => s.trim()).filter(Boolean))
  const [html, setHtml] = useState(plantilla.contenidoHtml)
  const [busy, setBusy] = useState(false)

  const toggleReq = (k: string) => setReq((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))
  async function guardar() {
    setBusy(true)
    try { await consentimientosService.actualizarPlantilla(plantilla.id, { titulo, codigo, activo, camposRequeridos: req, contenidoHtml: html }); notify('Plantilla guardada'); onSaved() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } finally { setBusy(false) }
  }
  async function eliminar() {
    if (!confirm('¿Eliminar esta plantilla? Los consentimientos ya generados no se afectan.')) return
    try { await consentimientosService.eliminarPlantilla(plantilla.id); notify('Plantilla eliminada'); onSaved() }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[94vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-slate-900">Editar plantilla</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button></div>

        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <label className="block sm:col-span-2"><span className="text-xs font-medium text-slate-500">Título</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inp} /></label>
          <label className="block"><span className="text-xs font-medium text-slate-500">Código</span>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={`${inp} font-mono`} /></label>
        </div>

        <div className="mb-3">
          <span className="text-xs font-medium text-slate-500">Datos del paciente requeridos para generar</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {CAMPOS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={req.includes(k)} onChange={() => toggleReq(k)} /> {l}</label>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <span className="text-xs font-medium text-slate-500">Contenido</span>
          <RichEditor initial={html} onChange={setHtml} />
          <details className="mt-1">
            <summary className="text-[11px] font-semibold text-slate-500 cursor-pointer">Variables disponibles</summary>
            <p className="text-[11px] text-slate-400 mt-1 font-mono break-words">{VARIABLES.map((v) => `{{${v}}}`).join('  ')} … y las de firma se completan al firmar.</p>
          </details>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 mb-4"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activa (disponible para generar)</label>

        <div className="flex gap-2">
          <button onClick={eliminar} className="px-3 py-2.5 border border-slate-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-medium">Eliminar</button>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={guardar} disabled={busy} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// Editor de texto con formato (contentEditable + comandos básicos).
function RichEditor({ initial, onChange }: { initial: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.innerHTML = initial }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c: string, arg?: string) => { ref.current?.focus(); document.execCommand(c, false, arg); if (ref.current) onChange(ref.current.innerHTML) }
  const Btn = ({ c, arg, children, title }: { c: string; arg?: string; children: React.ReactNode; title: string }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); cmd(c, arg) }} className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100">{children}</button>
  )
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1 mb-1">
        <Btn c="bold" title="Negrita"><b>B</b></Btn>
        <Btn c="italic" title="Cursiva"><i>I</i></Btn>
        <Btn c="underline" title="Subrayado"><u>U</u></Btn>
        <Btn c="formatBlock" arg="h3" title="Subtítulo">H3</Btn>
        <Btn c="formatBlock" arg="p" title="Párrafo">¶</Btn>
        <Btn c="insertUnorderedList" title="Lista">•</Btn>
        <Btn c="insertOrderedList" title="Lista numerada">1.</Btn>
        <Btn c="removeFormat" title="Quitar formato">✕</Btn>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={() => ref.current && onChange(ref.current.innerHTML)}
        className="border border-slate-200 rounded-xl p-3 min-h-[280px] max-h-[45vh] overflow-y-auto text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-500 [&_h1]:text-base [&_h1]:font-bold [&_h3]:font-semibold [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_p]:my-1" />
    </div>
  )
}

const inp = 'w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
