import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  EstadoAsistenteDTO, SesionAsistenteDTO, MensajeAsistenteDTO, ResultadoAsistenteDTO,
  ColumnaAsistenteDTO, PacienteDTO,
} from '@shared/types'
import { ApiError } from '@/services/api'
import { asistenteService, descargarResultadoXlsx } from '@/services/asistente.service'
import { pacientesService } from '@/services/clinica.service'
import { fmtMonto } from '@/lib/money'

// Marcadores de "cifra no verificada" que pone el backend (ver
// backend/src/services/asistente/verificacion.ts). La UI los atenúa.
const NV_ABRE = '⟦nv⟧'
const NV_CIERRA = '⟦/nv⟧'

const FILAS_POR_PAGINA = 50

// Preguntas de ejemplo por herramienta (solo se muestran las disponibles).
const EJEMPLOS: Record<string, string> = {
  buscar_paciente: 'Buscá al paciente Juan Pérez',
  ficha_resumen: 'Mostrame el resumen de la ficha de @…',
  planes_sin_pago: '¿Qué planes aprobados no tienen ningún pago este mes?',
  planes_sin_ejecucion: '¿Qué planes aprobados aún no tienen ninguna acción ejecutada?',
  pacientes_inactivos_con_saldo: 'Pacientes con saldo que no vienen hace 6 meses',
  produccion_por_profesional: 'Producción por profesional este mes',
  cuadre_caja: 'Dame el cuadre de caja de esta semana',
  ocupacion_agenda: '¿Cuántas horas se perdieron por cancelaciones este mes?',
  embudo_crm: '¿Cómo viene el embudo de leads este mes?',
}

export function Asistente() {
  const [estado, setEstado] = useState<EstadoAsistenteDTO | null>(null)
  const [errorEstado, setErrorEstado] = useState<string | null>(null)
  const [sesiones, setSesiones] = useState<SesionAsistenteDTO[]>([])
  const [activaId, setActivaId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<MensajeAsistenteDTO[]>([])
  const [resultados, setResultados] = useState<ResultadoAsistenteDTO[]>([])
  const [enviando, setEnviando] = useState(false)
  const [errorTurno, setErrorTurno] = useState<string | null>(null)
  const [panelAbierto, setPanelAbierto] = useState(false) // lista de sesiones en móvil
  const finRef = useRef<HTMLDivElement>(null)

  // Carga inicial: estado (herramientas/uso) + sesiones.
  useEffect(() => {
    asistenteService.estado()
      .then(setEstado)
      .catch((e) => setErrorEstado(e instanceof ApiError ? e.message : 'No se pudo cargar el asistente.'))
    asistenteService.listarSesiones().then(setSesiones).catch(() => {})
  }, [])

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, enviando])

  async function abrirSesion(id: string) {
    setActivaId(id); setErrorTurno(null); setPanelAbierto(false)
    setMensajes([]); setResultados([])
    try {
      const d = await asistenteService.obtenerSesion(id)
      setMensajes(d.mensajes); setResultados(d.resultados)
    } catch (e) {
      setErrorTurno(e instanceof ApiError ? e.message : 'No se pudo abrir la sesión.')
    }
  }

  async function nuevaSesion() {
    try {
      const s = await asistenteService.crearSesion()
      setSesiones((prev) => [s, ...prev])
      setActivaId(s.id); setMensajes([]); setResultados([]); setErrorTurno(null); setPanelAbierto(false)
    } catch (e) {
      setErrorTurno(e instanceof ApiError ? e.message : 'No se pudo crear la sesión.')
    }
  }

  async function borrarSesion(id: string) {
    if (!confirm('¿Borrar esta conversación? No se puede deshacer.')) return
    try {
      await asistenteService.eliminarSesion(id)
      setSesiones((prev) => prev.filter((s) => s.id !== id))
      if (activaId === id) { setActivaId(null); setMensajes([]); setResultados([]) }
    } catch { /* noop */ }
  }

  async function enviar(texto: string) {
    if (!texto.trim() || enviando) return
    let sesionId = activaId
    // Si no hay sesión activa, crea una al vuelo.
    if (!sesionId) {
      const s = await asistenteService.crearSesion().catch(() => null)
      if (!s) { setErrorTurno('No se pudo iniciar la conversación.'); return }
      setSesiones((prev) => [s, ...prev]); setActivaId(s.id); sesionId = s.id
    }
    setErrorTurno(null)
    const optimista: MensajeAsistenteDTO = { id: `tmp-${Date.now()}`, rol: 'user', contenido: limpiarMenciones(texto), createdAt: new Date().toISOString() }
    setMensajes((prev) => [...prev, optimista])
    setEnviando(true)
    try {
      const r = await asistenteService.enviarMensaje(sesionId, texto)
      setMensajes((prev) => [...prev, r.mensaje])
      setResultados((prev) => [...prev, ...r.resultados])
      // La primera pregunta fija el título de la sesión: refrescamos la lista.
      asistenteService.listarSesiones().then(setSesiones).catch(() => {})
    } catch (e) {
      setErrorTurno(e instanceof ApiError ? e.message : 'No se pudo completar la consulta.')
    } finally {
      setEnviando(false)
    }
  }

  if (errorEstado) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-800">Asistente de IA</h1>
        <p className="mt-2 text-sm text-slate-500">{errorEstado}</p>
      </div>
    )
  }
  if (!estado) return <p className="text-sm text-slate-400 mt-8">Cargando asistente…</p>
  if (!estado.habilitado) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-800">Asistente de IA</h1>
        <p className="mt-2 text-sm text-slate-500">El asistente está desactivado en este momento.</p>
      </div>
    )
  }

  const herramientas = estado.herramientas.map((h) => h.nombre)
  const sugerencias = herramientas.map((n) => EJEMPLOS[n]).filter(Boolean).slice(0, 6)

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-10rem)]">
      {/* Lista de sesiones */}
      <aside className={`md:w-64 md:flex-shrink-0 ${panelAbierto ? 'block' : 'hidden md:block'}`}>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 h-full flex flex-col">
          <button onClick={nuevaSesion} className="w-full px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">
            + Nueva consulta
          </button>
          <div className="mt-3 flex-1 overflow-y-auto space-y-1">
            {sesiones.length === 0 && <p className="text-xs text-slate-400 px-1">Sin conversaciones todavía.</p>}
            {sesiones.map((s) => (
              <div key={s.id} className={`group flex items-center gap-1 rounded-lg ${activaId === s.id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}>
                <button onClick={() => abrirSesion(s.id)} className="flex-1 text-left px-2 py-2 min-w-0">
                  <p className={`text-sm truncate ${activaId === s.id ? 'text-cyan-700 font-medium' : 'text-slate-700'}`}>{s.titulo || 'Nueva consulta'}</p>
                </button>
                <button onClick={() => borrarSesion(s.id)} title="Borrar" className="px-2 text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100">✕</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400 px-1">Usaste {estado.uso.consultasHoy} de {estado.uso.limiteDia} consultas hoy.</p>
        </div>
      </aside>

      {/* Conversación */}
      <section className="flex-1 min-w-0 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-slate-700">Asistente de IA</h1>
          <button onClick={() => setPanelAbierto((o) => !o)} className="md:hidden text-xs text-cyan-600">Conversaciones</button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
          {mensajes.length === 0 && !enviando && (
            <div className="max-w-xl mx-auto text-center mt-6">
              <p className="text-slate-500 text-sm">Preguntá sobre los datos de la clínica. Respondo con tablas y podés exportar a Excel.</p>
              {sugerencias.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {sugerencias.map((q) => (
                    <button key={q} onClick={() => enviar(q)} className="text-left text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl hover:border-cyan-300 hover:bg-cyan-50/40 text-slate-600">{q}</button>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-slate-400">Para nombrar a un paciente escribí <b>@</b> y elegilo de la lista.</p>
            </div>
          )}

          {mensajes.map((m) => (
            <div key={m.id}>
              <Burbuja mensaje={m} />
              {m.rol === 'assistant' && resultados.filter((r) => r.mensajeId === m.id).map((r) => (
                <TablaResultado key={r.id} r={r} />
              ))}
            </div>
          ))}

          {enviando && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="inline-block w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              Consultando la base… (puede tardar hasta un minuto)
            </div>
          )}
          {errorTurno && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{errorTurno}</p>}
          <div ref={finRef} />
        </div>

        <CajaTexto enviando={enviando} onEnviar={enviar} />
      </section>
    </div>
  )
}

// ── Burbuja de mensaje ───────────────────────────────────────────────────────

function Burbuja({ mensaje }: { mensaje: MensajeAsistenteDTO }) {
  const esUser = mensaje.rol === 'user'
  return (
    <div className={`flex ${esUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${esUser ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
        {esUser ? mensaje.contenido : <Prosa texto={mensaje.contenido} />}
      </div>
    </div>
  )
}

// Prosa del asistente con las cifras no verificadas atenuadas.
function Prosa({ texto }: { texto: string }) {
  const partes = useMemo(() => partirProsa(texto), [texto])
  return (
    <p className="whitespace-pre-wrap">
      {partes.map((p, i) => p.nv
        ? <span key={i} className="text-slate-400 italic" title="Esta cifra no se pudo verificar contra la base.">{p.t}</span>
        : <span key={i}>{p.t}</span>)}
    </p>
  )
}

function partirProsa(texto: string): { nv: boolean; t: string }[] {
  const partes: { nv: boolean; t: string }[] = []
  let i = 0
  while (i < texto.length) {
    const a = texto.indexOf(NV_ABRE, i)
    if (a === -1) { partes.push({ nv: false, t: texto.slice(i) }); break }
    if (a > i) partes.push({ nv: false, t: texto.slice(i, a) })
    const c = texto.indexOf(NV_CIERRA, a + NV_ABRE.length)
    if (c === -1) { partes.push({ nv: false, t: texto.slice(a) }); break }
    partes.push({ nv: true, t: texto.slice(a + NV_ABRE.length, c) })
    i = c + NV_CIERRA.length
  }
  return partes
}

// ── Tabla de resultado ───────────────────────────────────────────────────────

function TablaResultado({ r }: { r: ResultadoAsistenteDTO }) {
  const [pagina, setPagina] = useState(0)
  const [comoAbierto, setComoAbierto] = useState(false)
  const [bajando, setBajando] = useState(false)
  const totalPaginas = Math.max(1, Math.ceil(r.filas.length / FILAS_POR_PAGINA))
  const visibles = r.filas.slice(pagina * FILAS_POR_PAGINA, (pagina + 1) * FILAS_POR_PAGINA)

  async function exportar() {
    setBajando(true)
    try { await descargarResultadoXlsx(r.id, r.herramienta) } catch { /* noop */ } finally { setBajando(false) }
  }

  if (r.columnas.length === 0 || r.filas.length === 0) {
    return <p className="mt-2 text-xs text-slate-400">Sin resultados para esta consulta.</p>
  }

  return (
    <div className="mt-2 bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{r.columnas.map((c) => <th key={c.clave} className="text-left font-medium px-3 py-2 whitespace-nowrap">{c.etiqueta}</th>)}</tr>
          </thead>
          <tbody>
            {visibles.map((fila, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.columnas.map((c) => <td key={c.clave} className="px-3 py-2 whitespace-nowrap text-slate-700">{fmtCelda(c, fila[c.clave])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/60">
        <span className="text-xs text-slate-400">
          {r.totalFilas > r.filas.length
            ? `Mostrando ${r.filas.length} de ${r.totalFilas} filas — exportá a Excel para el resto.`
            : `${r.totalFilas} ${r.totalFilas === 1 ? 'fila' : 'filas'}`}
        </span>
        <div className="flex items-center gap-2">
          {totalPaginas > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-slate-100">←</button>
              <span className="text-slate-400">{pagina + 1}/{totalPaginas}</span>
              <button disabled={pagina >= totalPaginas - 1} onClick={() => setPagina((p) => p + 1)} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-slate-100">→</button>
            </div>
          )}
          <button onClick={() => setComoAbierto((o) => !o)} className="text-xs text-slate-500 hover:text-slate-700">Cómo se calculó ▾</button>
          <button onClick={exportar} disabled={bajando} className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg">
            {bajando ? 'Exportando…' : 'Exportar a Excel'}
          </button>
        </div>
      </div>
      {comoAbierto && (
        <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-500">
          <p>Herramienta: <span className="font-mono text-slate-700">{r.herramienta}</span></p>
          <p className="mt-0.5 break-words">Parámetros: <span className="font-mono text-slate-700">{JSON.stringify(r.parametros)}</span></p>
        </div>
      )}
    </div>
  )
}

function fmtCelda(c: ColumnaAsistenteDTO, v: unknown): string {
  if (v == null || v === '') return '—'
  switch (c.tipo) {
    case 'dinero': return fmtMonto(Number(v))
    case 'entero': return String(v)
    case 'porcentaje': return `${v}%`
    case 'fecha': { const d = new Date(String(v)); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-CL') }
    default: return String(v) // texto, paciente
  }
}

// ── Caja de texto con menciones @ ────────────────────────────────────────────

function CajaTexto({ enviando, onEnviar }: { enviando: boolean; onEnviar: (t: string) => void }) {
  const [texto, setTexto] = useState('')
  const [query, setQuery] = useState<string | null>(null) // término de mención activo
  const [resultados, setResultados] = useState<PacienteDTO[]>([])

  // Detecta una mención a medio escribir: un @ seguido de texto sin cerrar, al final.
  useEffect(() => {
    const m = texto.match(/@([\p{L}\p{N}][\p{L}\p{N}\s]{0,38})$/u)
    const q = m ? m[1].trim() : null
    setQuery(q && q.length >= 2 ? q : null)
  }, [texto])

  useEffect(() => {
    if (!query) { setResultados([]); return }
    const t = setTimeout(() => {
      pacientesService.listar(query).then((r) => setResultados(r.slice(0, 6))).catch(() => setResultados([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  function elegir(p: PacienteDTO) {
    // Reemplaza el "@query" final por la mención que el backend entiende.
    const nuevo = texto.replace(/@([\p{L}\p{N}][\p{L}\p{N}\s]{0,38})$/u, `@[${p.nombre} ${p.apellido}](pac:${p.id}) `)
    setTexto(nuevo); setQuery(null); setResultados([])
  }

  function submit() {
    const t = texto.trim()
    if (!t || enviando) return
    onEnviar(t); setTexto(''); setQuery(null); setResultados([])
  }

  return (
    <div className="relative border-t border-slate-200 p-3 bg-white">
      {resultados.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto z-10">
          {resultados.map((p) => (
            <button key={p.id} type="button" onClick={() => elegir(p)} className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-800">{p.nombre} {p.apellido}</span>
              <span className="text-xs text-slate-400 font-mono ml-2">{p.rut ?? 'Sin RUT'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !query) { e.preventDefault(); submit() } }}
          disabled={enviando}
          rows={2}
          placeholder={enviando ? 'Consultando…' : 'Escribí tu consulta…  (@ para nombrar a un paciente)'}
          className="flex-1 resize-none px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-50"
        />
        <button onClick={submit} disabled={enviando || !texto.trim()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
          Enviar
        </button>
      </div>
    </div>
  )
}

// Para mostrar lo que el usuario escribió: @[Nombre](pac:id) → Nombre.
function limpiarMenciones(texto: string): string {
  return texto.replace(/@\[([^\]]+)\]\((?:pac|lead):[^)]+\)/gi, '$1')
}
