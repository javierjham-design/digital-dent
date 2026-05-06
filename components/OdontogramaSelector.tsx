'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export type ZonaDental = 'PIEZA' | 'MAXILAR_SUPERIOR' | 'MAXILAR_INFERIOR' | 'CUADRANTE_1' | 'CUADRANTE_2' | 'CUADRANTE_3' | 'CUADRANTE_4' | 'GENERAL'

export interface SeleccionDental {
  tipo: ZonaDental
  piezas: number[]   // empty if zona is not PIEZA
  zona?: string
}

interface DienteInfo {
  numero: number
  estadoActual?: string
}

interface Props {
  dientes?: DienteInfo[]
  seleccion: SeleccionDental
  onChange: (sel: SeleccionDental) => void
}

const ESTADO_COLORES: Record<string, string> = {
  SANO: '',
  CARIES: 'bg-red-200 border-red-400',
  OBTURADO: 'bg-blue-200 border-blue-400',
  AUSENTE: 'bg-gray-200 border-gray-400',
  CORONA: 'bg-yellow-200 border-yellow-400',
  ENDODONCIA: 'bg-purple-200 border-purple-400',
  EXTRACCION: 'bg-gray-700 border-gray-900',
}

// FDI notation
const SUPERIORES = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
const INFERIORES = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

const NOMBRE_PIEZA: Record<number, string> = {
  11:'IC Sup Der',12:'IL Sup Der',13:'C Sup Der',14:'PM1 Sup Der',15:'PM2 Sup Der',16:'M1 Sup Der',17:'M2 Sup Der',18:'M3 Sup Der',
  21:'IC Sup Izq',22:'IL Sup Izq',23:'C Sup Izq',24:'PM1 Sup Izq',25:'PM2 Sup Izq',26:'M1 Sup Izq',27:'M2 Sup Izq',28:'M3 Sup Izq',
  31:'IC Inf Izq',32:'IL Inf Izq',33:'C Inf Izq',34:'PM1 Inf Izq',35:'PM2 Inf Izq',36:'M1 Inf Izq',37:'M2 Inf Izq',38:'M3 Inf Izq',
  41:'IC Inf Der',42:'IL Inf Der',43:'C Inf Der',44:'PM1 Inf Der',45:'PM2 Inf Der',46:'M1 Inf Der',47:'M2 Inf Der',48:'M3 Inf Der',
}

export function OdontogramaSelector({ dientes = [], seleccion, onChange }: Props) {
  const estadoMap: Record<number, string> = {}
  dientes.forEach((d) => { estadoMap[d.numero] = d.estadoActual ?? 'SANO' })

  const isPiezaMode = seleccion.tipo === 'PIEZA'
  const isPiezaSelected = (n: number) => seleccion.piezas.includes(n)

  function togglePieza(numero: number) {
    if (!isPiezaMode) {
      onChange({ tipo: 'PIEZA', piezas: [numero] })
      return
    }
    const piezas = isPiezaSelected(numero)
      ? seleccion.piezas.filter((p) => p !== numero)
      : [...seleccion.piezas, numero]
    onChange({ tipo: 'PIEZA', piezas })
  }

  function selectZona(tipo: ZonaDental, zona: string, piezas: number[]) {
    onChange({ tipo, piezas, zona })
  }

  function Diente({ numero }: { numero: number }) {
    const estado = estadoMap[numero] ?? 'SANO'
    const colorClass = ESTADO_COLORES[estado] ?? ''
    const selected = isPiezaMode && isPiezaSelected(numero)
    const isAusente = estado === 'AUSENTE'

    return (
      <button
        type="button"
        onClick={() => togglePieza(numero)}
        title={`${numero} - ${NOMBRE_PIEZA[numero] ?? ''} (${estado})`}
        className={cn(
          'flex flex-col items-center gap-0.5 group select-none',
        )}
      >
        <span className="text-[9px] text-slate-400 leading-none">{numero}</span>
        <div className={cn(
          'w-6 h-7 rounded-md border-2 transition-all duration-150 flex items-center justify-center',
          selected
            ? 'border-cyan-500 bg-cyan-400 shadow-md scale-110'
            : colorClass || 'border-slate-300 bg-white group-hover:border-cyan-400 group-hover:bg-cyan-50',
          isAusente && 'opacity-40',
        )}>
          {isAusente && (
            <span className="text-[8px] text-slate-500 font-bold">✕</span>
          )}
        </div>
      </button>
    )
  }

  const zonasBotones = [
    { label: 'Max. Superior', tipo: 'MAXILAR_SUPERIOR' as ZonaDental, zona: 'Maxilar Superior', piezas: SUPERIORES },
    { label: 'Max. Inferior', tipo: 'MAXILAR_INFERIOR' as ZonaDental, zona: 'Maxilar Inferior', piezas: INFERIORES },
    { label: 'Cuad. 1 (Sup Der)', tipo: 'CUADRANTE_1' as ZonaDental, zona: 'Cuadrante 1', piezas: [11,12,13,14,15,16,17,18] },
    { label: 'Cuad. 2 (Sup Izq)', tipo: 'CUADRANTE_2' as ZonaDental, zona: 'Cuadrante 2', piezas: [21,22,23,24,25,26,27,28] },
    { label: 'Cuad. 3 (Inf Izq)', tipo: 'CUADRANTE_3' as ZonaDental, zona: 'Cuadrante 3', piezas: [31,32,33,34,35,36,37,38] },
    { label: 'Cuad. 4 (Inf Der)', tipo: 'CUADRANTE_4' as ZonaDental, zona: 'Cuadrante 4', piezas: [41,42,43,44,45,46,47,48] },
    { label: 'General / Boca completa', tipo: 'GENERAL' as ZonaDental, zona: 'General', piezas: [] },
  ]

  const resumenSeleccion = () => {
    if (seleccion.tipo === 'PIEZA' && seleccion.piezas.length > 0) {
      return seleccion.piezas.length === 1
        ? `Pieza ${seleccion.piezas[0]} — ${NOMBRE_PIEZA[seleccion.piezas[0]] ?? ''}`
        : `Piezas: ${seleccion.piezas.join(', ')}`
    }
    if (seleccion.zona) return seleccion.zona
    return 'Sin selección'
  }

  return (
    <div className="space-y-4">
      {/* Odontograma */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Arcada superior</span>
          <span className="text-xs text-slate-400">Haz clic en las piezas para seleccionar</span>
        </div>
        <div className="flex justify-center gap-1 mb-1">
          {/* Línea divisoria cuadrantes */}
          <div className="flex gap-1">
            {SUPERIORES.slice(0,8).map((n) => <Diente key={n} numero={n} />)}
          </div>
          <div className="w-px bg-slate-200 mx-1" />
          <div className="flex gap-1">
            {SUPERIORES.slice(8).map((n) => <Diente key={n} numero={n} />)}
          </div>
        </div>
        <div className="border-t border-dashed border-slate-200 my-3" />
        <div className="flex justify-center gap-1 mt-1">
          <div className="flex gap-1">
            {INFERIORES.slice(0,8).map((n) => <Diente key={n} numero={n} />)}
          </div>
          <div className="w-px bg-slate-200 mx-1" />
          <div className="flex gap-1">
            {INFERIORES.slice(8).map((n) => <Diente key={n} numero={n} />)}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Arcada inferior</span>
          {(seleccion.piezas.length > 0 || seleccion.zona) && (
            <button
              type="button"
              onClick={() => onChange({ tipo: 'PIEZA', piezas: [] })}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Limpiar selección
            </button>
          )}
        </div>
      </div>

      {/* Zonas */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">O seleccionar zona</p>
        <div className="flex flex-wrap gap-1.5">
          {zonasBotones.map((z) => {
            const active = seleccion.tipo === z.tipo && seleccion.zona === z.zona
            return (
              <button
                key={z.tipo}
                type="button"
                onClick={() => selectZona(z.tipo, z.zona, z.piezas)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  active
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-400 hover:text-cyan-600'
                )}
              >
                {z.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Resumen selección */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
        (seleccion.piezas.length > 0 || seleccion.zona)
          ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
          : 'bg-slate-50 text-slate-400 border border-slate-100'
      )}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        </svg>
        <span className="font-medium">{resumenSeleccion()}</span>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(ESTADO_COLORES).map(([estado, cls]) => (
          <div key={estado} className="flex items-center gap-1 text-xs text-slate-500">
            <div className={cn('w-3 h-3 rounded border border-slate-300', cls || 'bg-white')} />
            {estado}
          </div>
        ))}
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <div className="w-3 h-3 rounded border-2 border-cyan-500 bg-cyan-400" />
          SELECCIONADO
        </div>
      </div>
    </div>
  )
}
