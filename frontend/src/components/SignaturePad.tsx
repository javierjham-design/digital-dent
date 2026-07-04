import { useEffect, useRef, useState } from 'react'

// Pad de firma en pantalla (mouse o dedo). Devuelve la firma como dataURL PNG.
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [vacio, setVacio] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current!
    // Escala para nitidez en pantallas retina.
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: React.PointerEvent) => {
    dibujando.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
    canvasRef.current!.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!dibujando.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y); ctx.stroke()
    if (vacio) setVacio(false)
  }
  const up = () => {
    if (!dibujando.current) return
    dibujando.current = false
    onChange(vacio ? null : canvasRef.current!.toDataURL('image/png'))
  }
  const limpiar = () => {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setVacio(true); onChange(null)
  }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white touch-none">
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="w-full h-40 rounded-xl cursor-crosshair touch-none" />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-slate-400">Firma en el recuadro con el mouse o el dedo.</span>
        <button type="button" onClick={limpiar} className="text-xs font-semibold text-slate-500 hover:text-rose-600">Limpiar</button>
      </div>
    </div>
  )
}
