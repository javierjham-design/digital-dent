import { useEffect, useRef, useState } from 'react'
import type { LiquidacionAdjuntoMeta } from '@shared/types'
import { liquidacionesService } from '@/services/caja.service'
import { ApiError } from '@/services/api'

const TIPOS = [['FACTURA', 'Factura'], ['COMPROBANTE', 'Comprobante de transferencia']] as const

// Adjuntos de una liquidación (factura del profesional + comprobante de pago).
// Se guardan como bytes en la base de la clínica. El profesional dueño y los
// gestores pueden subir/abrir/eliminar.
export function AdjuntosLiquidacion({ liqId, puedeEditar = true }: { liqId: string; puedeEditar?: boolean }) {
  const [items, setItems] = useState<LiquidacionAdjuntoMeta[]>([])
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const facturaRef = useRef<HTMLInputElement>(null)
  const comprobanteRef = useRef<HTMLInputElement>(null)
  const refOf = (tipo: string) => (tipo === 'FACTURA' ? facturaRef : comprobanteRef)

  const cargar = () => liquidacionesService.adjuntos(liqId).then(setItems).catch(() => {})
  useEffect(() => { cargar() }, [liqId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subir(tipo: 'FACTURA' | 'COMPROBANTE', file: File) {
    setSubiendo(tipo); setError('')
    try { await liquidacionesService.subirAdjunto(liqId, tipo, file); cargar() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Error al subir') }
    finally { setSubiendo(null) }
  }
  async function abrir(adjId: string) { try { await liquidacionesService.abrirAdjunto(liqId, adjId) } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo abrir') } }
  async function eliminar(adjId: string) {
    if (!confirm('¿Eliminar este archivo?')) return
    try { await liquidacionesService.eliminarAdjunto(liqId, adjId); cargar() } catch (e) { setError(e instanceof ApiError ? e.message : 'Error') }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Documentos</p>
      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
      <div className="space-y-2">
        {TIPOS.map(([tipo, label]) => {
          const archivos = items.filter((a) => a.tipo === tipo)
          return (
            <div key={tipo} className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <span className="text-sm text-slate-700">{label}</span>
                {archivos.length === 0 && <span className="text-xs text-slate-400 ml-2">— sin archivo</span>}
                <div className="flex flex-wrap gap-2 mt-1">
                  {archivos.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 rounded-lg px-2 py-1">
                      <button onClick={() => abrir(a.id)} className="text-cyan-700 hover:underline truncate max-w-[200px]">{a.nombre}</button>
                      {puedeEditar && <button onClick={() => eliminar(a.id)} className="text-slate-400 hover:text-rose-600" title="Eliminar">×</button>}
                    </span>
                  ))}
                </div>
              </div>
              {puedeEditar && (
                <>
                  <button onClick={() => refOf(tipo).current?.click()} disabled={subiendo === tipo}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">
                    {subiendo === tipo ? 'Subiendo…' : 'Subir'}
                  </button>
                  <input ref={refOf(tipo)} type="file" accept=".pdf,image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(tipo, f); if (e.target) e.target.value = '' }} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
