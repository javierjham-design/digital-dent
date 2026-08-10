import { useEffect, useRef, useState } from 'react'
import { esteticaService, type ZonaFacialDTO, type ZonaFichaDTO, type TrazoDTO, type DibujoDTO } from '@/services/estetica.service'

// ── Gráfico facial: DOS capas sobre el mismo lienzo ──────────────────────────
//
// CAPA 1 — ZONAS CLÍNICAS (equivalente del odontograma). Paths clicables con id
// `zona-{codigo}`; se seleccionan con el PUNTERO y alimentan el plan (facturable).
// CAPA 2 — DIBUJO LIBRE (anotación). Trazos VECTORIALES {herramienta,color,puntos}
// con coordenadas normalizadas al viewBox (0..1); nunca imagen rasterizada.
//
// Reglas de la separación (criterio de aceptación, no sugerencia):
//  · La goma borra TRAZOS, jamás zonas ni tratamientos.
//  · Un trazo nunca genera una prestación ni aparece en un presupuesto.
//  · Modo explícito: con el puntero se seleccionan zonas; con las herramientas se
//    dibuja. Nunca los dos a la vez.
//  · Borrar un plan/tratamiento no borra los trazos, y viceversa (sin FKs).
//
// ⚠️ SVG PLACEHOLDER: pocas zonas para avanzar mientras se encarga la ilustración
// definitiva. El contrato del SVG real: dos archivos (rostro-f/rostro-m) con el
// MISMO viewBox (0 0 1000 1300) y los MISMOS ids `zona-{codigo}` (códigos del
// catálogo ZonaFacial); solo cambia la ilustración base (grupo no interactivo).

const VIEWBOX = { w: 1000, h: 1300 }

// Placeholder: formas simples posicionadas sobre un óvalo de rostro. El SVG real
// reemplaza SOLO este mapa de paths (mismos códigos → cero cambios de lógica).
const PATHS_PLACEHOLDER: Record<string, string> = {
  frente: 'M 320 260 Q 500 200 680 260 L 660 380 Q 500 340 340 380 Z',
  glabela: 'M 455 400 L 545 400 L 535 480 L 465 480 Z',
  patas_gallo_der: 'M 285 480 L 345 470 L 350 540 L 295 550 Z',
  patas_gallo_izq: 'M 655 470 L 715 480 L 705 550 L 650 540 Z',
  surco_nasogeniano_der: 'M 375 640 L 430 660 L 415 760 L 360 730 Z',
  surco_nasogeniano_izq: 'M 570 660 L 625 640 L 640 730 L 585 760 Z',
  labio_sup: 'M 420 800 Q 500 770 580 800 L 570 850 Q 500 830 430 850 Z',
  menton: 'M 430 940 Q 500 920 570 940 L 555 1030 Q 500 1050 445 1030 Z',
}

const ESTADO_COLORES: Record<string, string> = { SANO: 'transparent', TRATADO: '#7c3aed', PLANIFICADO: '#0ea5e9', OBSERVACION: '#f59e0b' }

type Herramienta = 'puntero' | 'lapiz' | 'circulo' | 'linea' | 'goma'

export function GraficoFacial({ pacienteId, sexo, selZonas, onToggleZona }: {
  pacienteId: string
  sexo?: string | null
  selZonas: Set<string>            // ids de ZonaFacial seleccionadas (capa 1 → plan)
  onToggleZona: (zonaId: string) => void
}) {
  const [zonas, setZonas] = useState<ZonaFacialDTO[]>([])
  const [estados, setEstados] = useState<ZonaFichaDTO[]>([])
  const [dibujo, setDibujo] = useState<DibujoDTO | null>(null)
  const [tool, setTool] = useState<Herramienta>('puntero')
  const [trazoActivo, setTrazoActivo] = useState<TrazoDTO | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const guardarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    esteticaService.zonas().then(setZonas).catch(() => {})
    esteticaService.zonasFicha(pacienteId).then(setEstados).catch(() => {})
    esteticaService.dibujo(pacienteId).then((d) => {
      // Sin fila guardada: el género se deriva del sexo del paciente.
      if (d.updatedAt === null && sexo) d.genero = sexo.toLowerCase().startsWith('m') ? 'M' : 'F'
      setDibujo(d)
    }).catch(() => {})
  }, [pacienteId, sexo])

  // Persistencia del dibujo con debounce (solo la capa 2; jamás toca zonas).
  const persistir = (d: DibujoDTO) => {
    setDibujo(d)
    if (guardarTimer.current) clearTimeout(guardarTimer.current)
    guardarTimer.current = setTimeout(() => {
      esteticaService.guardarDibujo(pacienteId, { genero: d.genero, trazos: d.trazos }).catch(() => {})
    }, 600)
  }

  const norm = (e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const onDown = (e: React.PointerEvent) => {
    if (!dibujo) return
    const p = norm(e); if (!p) return
    if (tool === 'goma') {
      // La goma borra el TRAZO más cercano al click (nunca zonas ni tratamientos).
      const idx = trazoCercano(dibujo.trazos, p)
      if (idx >= 0) persistir({ ...dibujo, trazos: dibujo.trazos.filter((_, i) => i !== idx) })
      return
    }
    if (tool === 'lapiz' || tool === 'circulo' || tool === 'linea') {
      setTrazoActivo({ herramienta: tool, color: '#1d4ed8', grosor: 2, puntos: [p, p] })
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!trazoActivo) return
    const p = norm(e); if (!p) return
    if (trazoActivo.herramienta === 'lapiz') setTrazoActivo({ ...trazoActivo, puntos: [...trazoActivo.puntos, p] })
    else setTrazoActivo({ ...trazoActivo, puntos: [trazoActivo.puntos[0], p] }) // círculo/línea: origen + destino
  }
  const onUp = () => {
    if (!trazoActivo || !dibujo) { setTrazoActivo(null); return }
    persistir({ ...dibujo, trazos: [...dibujo.trazos, trazoActivo] })
    setTrazoActivo(null)
  }

  const deshacer = () => { if (dibujo && dibujo.trazos.length > 0) persistir({ ...dibujo, trazos: dibujo.trazos.slice(0, -1) }) }
  const reiniciar = () => { if (dibujo && (dibujo.trazos.length === 0 || confirm('¿Borrar todos los trazos del dibujo? (No afecta zonas ni tratamientos.)'))) persistir({ ...dibujo, trazos: [] }) }
  const toggleGenero = () => { if (dibujo) persistir({ ...dibujo, genero: dibujo.genero === 'F' ? 'M' : 'F' }) }

  const estadoDe = new Map(estados.map((z) => [z.zonaId, z]))
  const modoDibujo = tool !== 'puntero'

  const btn = (t: Herramienta, label: string, title: string) => (
    <button key={t} type="button" onClick={() => setTool(t)} title={title}
      className={`w-9 h-9 rounded-lg border text-sm ${tool === t ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="relative bg-white rounded-xl border border-slate-200 overflow-hidden">
        <svg ref={svgRef} viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} className="w-full select-none touch-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          {/* Base (ilustración placeholder — la reemplaza el SVG encargado) */}
          <g id="base" pointerEvents="none">
            <ellipse cx="500" cy="620" rx="310" ry="420" fill="#fdf1e7" stroke="#e2c9b0" strokeWidth="3" />
            <ellipse cx="500" cy="1180" rx="180" ry="120" fill="#fdf1e7" stroke="#e2c9b0" strokeWidth="3" />
            {dibujo?.genero === 'M'
              ? <rect x="330" y="150" width="340" height="90" rx="30" fill="#d8c4ae" />
              : <path d="M 250 300 Q 240 120 500 110 Q 760 120 750 300 L 770 620 L 700 600 L 690 360 Q 500 300 310 360 L 300 600 L 230 620 Z" fill="#d8c4ae" />}
          </g>
          {/* CAPA 1: zonas clínicas (clicables SOLO con el puntero) */}
          <g id="zonas">
            {zonas.filter((z) => PATHS_PLACEHOLDER[z.codigo]).map((z) => {
              const est = estadoDe.get(z.id)
              const sel = selZonas.has(z.id)
              return (
                <path key={z.id} id={`zona-${z.codigo}`} d={PATHS_PLACEHOLDER[z.codigo]}
                  fill={sel ? 'rgba(8,145,178,0.45)' : (est?.color ?? ESTADO_COLORES[est?.estado ?? 'SANO'] ?? 'transparent')}
                  fillOpacity={sel ? 1 : 0.5}
                  stroke={sel ? '#0891b2' : '#94a3b8'} strokeWidth={sel ? 4 : 2} strokeDasharray={sel ? undefined : '8 6'}
                  pointerEvents={modoDibujo ? 'none' : 'auto'}
                  className={modoDibujo ? '' : 'cursor-pointer'}
                  onClick={() => { if (!modoDibujo) onToggleZona(z.id) }}>
                  <title>{z.nombre}</title>
                </path>
              )
            })}
          </g>
          {/* CAPA 2: dibujo libre (trazos vectoriales) */}
          <g id="dibujo" pointerEvents="none">
            {[...(dibujo?.trazos ?? []), ...(trazoActivo ? [trazoActivo] : [])].map((t, i) => <TrazoSvg key={i} t={t} />)}
          </g>
        </svg>
      </div>

      {/* Barra de herramientas de la capa 2 (+ puntero para volver a la capa 1) */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {btn('puntero', '⭢', 'Puntero: seleccionar zonas (capa clínica)')}
        {btn('lapiz', '✎', 'Lápiz (dibujo libre)')}
        {btn('circulo', '◯', 'Círculo')}
        {btn('linea', '—', 'Línea')}
        {btn('goma', '⌫', 'Goma: borra trazos (jamás zonas ni tratamientos)')}
        <button type="button" onClick={deshacer} title="Deshacer último trazo" className="w-9 h-9 rounded-lg border bg-white text-slate-600 border-slate-200 hover:bg-slate-50 text-sm">↩</button>
        <button type="button" onClick={reiniciar} title="Reiniciar dibujo (borra todos los trazos)" className="w-9 h-9 rounded-lg border bg-white text-slate-600 border-slate-200 hover:bg-slate-50 text-sm">⟲</button>
        <span className="mx-1 text-slate-200">|</span>
        <button type="button" onClick={toggleGenero} title="Cambiar ilustración (femenina/masculina)" className="px-3 h-9 rounded-lg border bg-white text-slate-600 border-slate-200 hover:bg-slate-50 text-sm">
          {dibujo?.genero === 'M' ? '♂' : '♀'}
        </button>
        {modoDibujo && <span className="text-xs text-amber-600 ml-2">Modo dibujo: las zonas no se seleccionan. Volvé al puntero para asignar prestaciones.</span>}
      </div>
    </div>
  )
}

function TrazoSvg({ t }: { t: TrazoDTO }) {
  const w = VIEWBOX.w, h = VIEWBOX.h
  const color = t.color ?? '#1d4ed8'
  const grosor = (t.grosor ?? 2) * 2
  if (t.herramienta === 'circulo') {
    const [a, b] = [t.puntos[0], t.puntos[t.puntos.length - 1]]
    const cx = ((a.x + b.x) / 2) * w, cy = ((a.y + b.y) / 2) * h
    const rx = Math.abs(b.x - a.x) / 2 * w, ry = Math.abs(b.y - a.y) / 2 * h
    return <ellipse cx={cx} cy={cy} rx={Math.max(rx, 4)} ry={Math.max(ry, 4)} fill="none" stroke={color} strokeWidth={grosor} />
  }
  if (t.herramienta === 'linea') {
    const [a, b] = [t.puntos[0], t.puntos[t.puntos.length - 1]]
    return <line x1={a.x * w} y1={a.y * h} x2={b.x * w} y2={b.y * h} stroke={color} strokeWidth={grosor} strokeLinecap="round" />
  }
  const d = t.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ')
  return <path d={d} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" />
}

// Trazo más cercano a un punto (para la goma). Distancia mínima punto-a-vértice.
function trazoCercano(trazos: TrazoDTO[], p: { x: number; y: number }): number {
  let mejor = -1, mejorDist = 0.03 // umbral en coordenadas normalizadas
  trazos.forEach((t, i) => {
    for (const q of t.puntos) {
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < mejorDist) { mejorDist = d; mejor = i }
    }
    // Para círculo/línea el trazo "vive" entre origen y destino: probar el punto medio.
    if (t.puntos.length >= 2) {
      const a = t.puntos[0], b = t.puntos[t.puntos.length - 1]
      const d = Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y)
      if (d < mejorDist) { mejorDist = d; mejor = i }
    }
  })
  return mejor
}
