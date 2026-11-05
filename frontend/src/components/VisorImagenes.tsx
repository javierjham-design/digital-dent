import { useCallback, useEffect, useRef, useState } from 'react'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { documentosService, type DocumentoMeta } from '@/services/documentos.service'

// Visor de imágenes/documentos EN PANTALLA (lightbox) — reemplaza el "abrir en pestaña nueva".
// Permite zoom (rueda / botones / doble clic) y desplazamiento (arrastrar) de radiografías y fotos.
// Para PDF rasteriza la 1ª página para previsualizarla acá mismo + botón "Abrir completo".

const TIPO_LABEL: Record<string, string> = {
  PERIAPICAL: 'Periapical', BITEWING_IZQ: 'Bitewing izquierda', BITEWING_DER: 'Bitewing derecha',
  PANORAMICA: 'Panorámica', TELERRADIOGRAFIA: 'Telerradiografía', CBCT: 'CBCT / Escáner 3D',
  FOTO: 'Foto clínica', INFORME: 'Informe (PDF)', OTRO: 'Otro documento',
}
const esImagen = (mime: string) => mime.startsWith('image/')
const ZOOM_MIN = 1
const ZOOM_MAX = 6

// Rasteriza la 1ª página de un PDF a PNG (data URL) para la vista previa en el visor.
async function pdfPrimeraPaginaPng(blob: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise
  return canvas.toDataURL('image/png')
}

export function VisorImagenes({ items, index, onClose, onIndex }: {
  items: DocumentoMeta[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const actual = items[index]
  const [src, setSrc] = useState<string | null>(null)   // lo que se muestra (imagen u PDF rasterizado)
  const [rawUrl, setRawUrl] = useState<string | null>(null) // archivo original (descargar / abrir completo)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [esPdf, setEsPdf] = useState(false)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const arrastre = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const objetos = useRef<string[]>([])

  const resetZoom = useCallback(() => { setScale(1); setTx(0); setTy(0) }, [])

  // Carga el archivo actual (autenticado → object URL). PDF → rasteriza 1ª página.
  useEffect(() => {
    if (!actual) return
    let vivo = true
    resetZoom()
    setEstado('cargando'); setSrc(null); setRawUrl(null); setEsPdf(false)
    documentosService.blobUrl(actual.id).then(async ({ url, mime }) => {
      if (!vivo) { URL.revokeObjectURL(url); return }
      objetos.current.push(url)
      setRawUrl(url)
      if (esImagen(mime)) {
        setSrc(url); setEstado('listo')
      } else if (mime === 'application/pdf') {
        setEsPdf(true)
        try {
          const resp = await fetch(url)
          const png = await pdfPrimeraPaginaPng(await resp.blob())
          if (vivo) { setSrc(png); setEstado('listo') }
        } catch { if (vivo) setEstado('error') }
      } else {
        setEsPdf(true); setEstado('error') // sin vista previa: se ofrece abrir/descargar
      }
    }).catch(() => { if (vivo) setEstado('error') })
    return () => { vivo = false }
  }, [actual, resetZoom])

  // Revoca todos los object URLs al desmontar.
  useEffect(() => () => { objetos.current.forEach((u) => URL.revokeObjectURL(u)); objetos.current = [] }, [])

  const irA = useCallback((i: number) => { if (i >= 0 && i < items.length) onIndex(i) }, [items.length, onIndex])
  const zoom = useCallback((delta: number) => {
    setScale((s) => {
      const n = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 10) / 10))
      if (n === 1) { setTx(0); setTy(0) }
      return n
    })
  }, [])

  // Teclado: Esc cierra, ←/→ navega, +/- zoom, 0 restablece.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') irA(index - 1)
      else if (e.key === 'ArrowRight') irA(index + 1)
      else if (e.key === '+' || e.key === '=') zoom(0.5)
      else if (e.key === '-' || e.key === '_') zoom(-0.5)
      else if (e.key === '0') resetZoom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, irA, onClose, zoom, resetZoom])

  function onWheel(e: React.WheelEvent) {
    if (!esImagen(actual?.mime ?? '') && !esPdf) return
    e.preventDefault()
    zoom(e.deltaY < 0 ? 0.3 : -0.3)
  }
  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return
    arrastre.current = { x: e.clientX, y: e.clientY, tx, ty }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!arrastre.current) return
    setTx(arrastre.current.tx + (e.clientX - arrastre.current.x))
    setTy(arrastre.current.ty + (e.clientY - arrastre.current.y))
  }
  function onPointerUp() { arrastre.current = null }

  function descargar() {
    if (!rawUrl || !actual) return
    const a = document.createElement('a')
    a.href = rawUrl; a.download = actual.nombre || 'archivo'
    document.body.appendChild(a); a.click(); a.remove()
  }

  if (!actual) return null
  const titulo = TIPO_LABEL[actual.tipo] ?? actual.tipo
  const btn = 'w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors'

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/90 backdrop-blur-sm" onClick={onClose}>
      {/* Barra superior */}
      <div className="flex items-center gap-2 px-3 py-2 text-white/90" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{titulo}{actual.dientes ? ` · pieza(s) ${actual.dientes}` : ''}</p>
          {actual.descripcion && <p className="text-xs text-white/60 truncate">{actual.descripcion}</p>}
        </div>
        {items.length > 1 && <span className="text-xs text-white/60 tabular-nums px-1">{index + 1} / {items.length}</span>}
        <button className={btn} title="Alejar (−)" onClick={() => zoom(-0.5)} disabled={scale <= ZOOM_MIN}>−</button>
        <span className="text-xs text-white/70 tabular-nums w-12 text-center select-none">{Math.round(scale * 100)}%</span>
        <button className={btn} title="Acercar (+)" onClick={() => zoom(0.5)} disabled={scale >= ZOOM_MAX}>＋</button>
        <button className={btn} title="Tamaño real (0)" onClick={resetZoom} disabled={scale === 1 && tx === 0 && ty === 0}>⤢</button>
        <button className={btn} title="Descargar" onClick={descargar} disabled={!rawUrl}>⤓</button>
        {esPdf && <button className={`${btn} w-auto px-2 text-xs`} title="Abrir PDF completo" onClick={() => rawUrl && window.open(rawUrl, '_blank')} disabled={!rawUrl}>PDF completo</button>}
        <button className={btn} title="Cerrar (Esc)" onClick={onClose}>✕</button>
      </div>

      {/* Lienzo */}
      <div className="relative flex-1 overflow-hidden flex items-center justify-center" onClick={(e) => e.stopPropagation()} onWheel={onWheel}>
        {items.length > 1 && (
          <>
            <button className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl disabled:opacity-20"
              onClick={() => irA(index - 1)} disabled={index === 0} title="Anterior (←)">‹</button>
            <button className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl disabled:opacity-20"
              onClick={() => irA(index + 1)} disabled={index === items.length - 1} title="Siguiente (→)">›</button>
          </>
        )}

        {estado === 'cargando' && <div className="text-white/60 text-sm animate-pulse">Cargando…</div>}
        {estado === 'error' && (
          <div className="text-center text-white/70 text-sm px-6">
            <p className="text-4xl mb-2">📄</p>
            <p>No se puede previsualizar este archivo aquí.</p>
            {rawUrl && <button className="mt-3 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-white text-sm" onClick={() => window.open(rawUrl, '_blank')}>Abrir en una pestaña</button>}
          </div>
        )}
        {estado === 'listo' && src && (
          <img
            src={src} alt={titulo} draggable={false}
            onDoubleClick={() => (scale === 1 ? zoom(1) : resetZoom())}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            className="max-h-full max-w-full object-contain select-none"
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: scale > 1 ? (arrastre.current ? 'grabbing' : 'grab') : 'zoom-in', transition: arrastre.current ? 'none' : 'transform 0.12s ease-out' }}
          />
        )}
      </div>
    </div>
  )
}
