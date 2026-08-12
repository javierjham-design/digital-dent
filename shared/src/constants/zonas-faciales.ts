// ═════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE ZONAS FACIALES — CONGELADO por revisión profesional (2026-08-11)
//
// 29 códigos (21 conceptos: 10 bilaterales ×2 + 9 mediales/global). Definiciones que
// aplicó el especialista de estética facial:
//   · Labios: una sola zona LABIOS (no superior/inferior separados).
//   · Masetero: FUERA (no se usa).
//   · Bichectomía y alas nasales: FUERA (no se marcan como zona).
//   · Cuello / escote: FUERA (el mapa es solo rostro).
//   · nombreVisible = nombre anatómico + coloquial entre paréntesis si lo tuviera.
// ESTE ARCHIVO ES LA ÚNICA FUENTE del catálogo: el seed del backend y el mapa del
// frontend leen de acá. Agregar zonas nuevas es barato; renombrar/fusionar las
// existentes obliga a migrar datos (el código queda grabado en cada tratamiento).
// ═════════════════════════════════════════════════════════════════════════════
//
// Tres campos SEPARADOS a propósito:
//  · codigo         — identificador interno; nunca se ve, NUNCA cambia. Sin el
//                     grupo adentro (es FRENTE, no TS_FRENTE): el agrupamiento por
//                     tercios es presentación y va a cambiar; el código no.
//  · nombreClinico  — término anatómico correcto (ficha e historia clínica).
//  · nombreVisible  — lo que lee la paciente en su presupuesto impreso.
// La lateralidad va en el código (_IZQ/_DER, PERSPECTIVA DEL PACIENTE: su _IZQ se
// dibuja a la DERECHA del espectador) porque cada lado se trata y cotiza aparte.
//
// `path` es la geometría REAL calibrada sobre la foto base del rostro (licenciada,
// en frontend/src/assets/rostro-base.jpg), viewBox 0 0 1000 1300. Se ajustó zona a
// zona con el editor visual (tmp-rostro/editor.html) y se recalibra igual si se
// cambia la foto. Los ids `zona-{codigo}` son el contrato con GraficoFacial.tsx.

export const ZONAS_VIEWBOX = { w: 1000, h: 1300 }

export interface ZonaFacialDef {
  codigo: string
  nombreClinico: string
  nombreVisible: string
  grupo: 'TERCIO_SUPERIOR' | 'TERCIO_MEDIO' | 'TERCIO_INFERIOR' | 'GLOBAL'
  orden: number
  path: string // geometría placeholder (misma para F/M; cambia solo la base)
}

const TS = 'TERCIO_SUPERIOR' as const
const TM = 'TERCIO_MEDIO' as const
const TI = 'TERCIO_INFERIOR' as const
const GL = 'GLOBAL' as const

// Perspectiva del paciente: _IZQ → lado derecho del espectador (x > 500).
export const ZONAS_FACIALES_NUCLEO: ZonaFacialDef[] = [
  // ── Tercio superior ──
  { codigo: 'FRENTE', nombreClinico: 'Región frontal', nombreVisible: 'Región frontal (frente)', grupo: TS, orden: 0,
    path: 'M 739.0 381.0 A 237 103 0 0 1 265.0 381.0 A 237 103 0 0 1 739.0 381.0 Z' },
  { codigo: 'GLABELA', nombreClinico: 'Complejo glabelar', nombreVisible: 'Glabela (entrecejo)', grupo: TS, orden: 1,
    path: 'M 553.0 533.0 A 54 42 0 0 1 445.0 533.0 A 54 42 0 0 1 553.0 533.0 Z' },
  { codigo: 'COLA_CEJA_DER', nombreClinico: 'Cola de ceja', nombreVisible: 'Cola de ceja · der', grupo: TS, orden: 2,
    path: 'M 317.5 534.5 A 54 22 -8 0 1 210.5 549.5 A 54 22 -8 0 1 317.5 534.5 Z' },
  { codigo: 'COLA_CEJA_IZQ', nombreClinico: 'Cola de ceja', nombreVisible: 'Cola de ceja · izq', grupo: TS, orden: 3,
    path: 'M 778.5 556.5 A 54 22 8 0 1 671.5 541.5 A 54 22 8 0 1 778.5 556.5 Z' },
  { codigo: 'PERIORBITAL_LAT_DER', nombreClinico: 'Región periorbitaria lateral', nombreVisible: 'Región periorbitaria (patas de gallo) · der', grupo: TS, orden: 4,
    path: 'M 237.6 527.8 A 42 58 8 0 1 154.4 516.2 A 42 58 8 0 1 237.6 527.8 Z' },
  { codigo: 'PERIORBITAL_LAT_IZQ', nombreClinico: 'Región periorbitaria lateral', nombreVisible: 'Región periorbitaria (patas de gallo) · izq', grupo: TS, orden: 5,
    path: 'M 850.6 538.2 A 42 58 -8 0 1 767.4 549.8 A 42 58 -8 0 1 850.6 538.2 Z' },
  { codigo: 'TEMPORAL_DER', nombreClinico: 'Región temporal', nombreVisible: 'Región temporal (sien) · der', grupo: TS, orden: 6,
    path: 'M 157.8 416.7 A 35 58 6 0 1 88.2 409.3 A 35 58 6 0 1 157.8 416.7 Z' },
  { codigo: 'TEMPORAL_IZQ', nombreClinico: 'Región temporal', nombreVisible: 'Región temporal (sien) · izq', grupo: TS, orden: 7,
    path: 'M 899.8 411.3 A 35 58 -6 0 1 830.2 418.7 A 35 58 -6 0 1 899.8 411.3 Z' },

  // ── Tercio medio ──
  { codigo: 'SURCO_LAGRIMAL_DER', nombreClinico: 'Surco lagrimal', nombreVisible: 'Surco lagrimal (ojera) · der', grupo: TM, orden: 8,
    path: 'M 427.3 657.0 A 72 25 -8 0 1 284.7 677.0 A 72 25 -8 0 1 427.3 657.0 Z' },
  { codigo: 'SURCO_LAGRIMAL_IZQ', nombreClinico: 'Surco lagrimal', nombreVisible: 'Surco lagrimal (ojera) · izq', grupo: TM, orden: 9,
    path: 'M 717.3 678.0 A 72 25 8 0 1 574.7 658.0 A 72 25 8 0 1 717.3 678.0 Z' },
  { codigo: 'MALAR_DER', nombreClinico: 'Región malar', nombreVisible: 'Región malar (pómulo) · der', grupo: TM, orden: 10,
    path: 'M 381.1 773.5 A 89 64 12 0 1 206.9 736.5 A 89 64 12 0 1 381.1 773.5 Z' },
  { codigo: 'MALAR_IZQ', nombreClinico: 'Región malar', nombreVisible: 'Región malar (pómulo) · izq', grupo: TM, orden: 11,
    path: 'M 782.1 736.5 A 89 64 -12 0 1 607.9 773.5 A 89 64 -12 0 1 782.1 736.5 Z' },
  { codigo: 'SUBMALAR_DER', nombreClinico: 'Región submalar', nombreVisible: 'Región submalar (hueco de la mejilla) · der', grupo: TM, orden: 12,
    path: 'M 337.4 866.9 A 64 50 8 0 1 210.6 849.1 A 64 50 8 0 1 337.4 866.9 Z' },
  { codigo: 'SUBMALAR_IZQ', nombreClinico: 'Región submalar', nombreVisible: 'Región submalar (hueco de la mejilla) · izq', grupo: TM, orden: 13,
    path: 'M 802.4 848.1 A 64 50 -8 0 1 675.6 865.9 A 64 50 -8 0 1 802.4 848.1 Z' },
  { codigo: 'SURCO_NASOGENIANO_DER', nombreClinico: 'Surco nasogeniano', nombreVisible: 'Surco nasogeniano · der', grupo: TM, orden: 14,
    path: 'M 379.3 911.8 A 25 81 108 0 1 394.7 864.2 A 25 81 108 0 1 379.3 911.8 Z' },
  { codigo: 'SURCO_NASOGENIANO_IZQ', nombreClinico: 'Surco nasogeniano', nombreVisible: 'Surco nasogeniano · izq', grupo: TM, orden: 15,
    path: 'M 616.3 859.2 A 25 81 -108 0 1 631.7 906.8 A 25 81 -108 0 1 616.3 859.2 Z' },
  { codigo: 'DORSO_NASAL', nombreClinico: 'Dorso nasal', nombreVisible: 'Dorso nasal (dorso de la nariz)', grupo: TM, orden: 16,
    path: 'M 537.0 679.0 A 42 155 0 0 1 453.0 679.0 A 42 155 0 0 1 537.0 679.0 Z' },
  { codigo: 'PUNTA_NASAL', nombreClinico: 'Punta nasal', nombreVisible: 'Punta nasal (punta de la nariz)', grupo: TM, orden: 17,
    path: 'M 555.0 829.0 A 64 42 0 0 1 427.0 829.0 A 64 42 0 0 1 555.0 829.0 Z' },

  // ── Tercio inferior ──
  { codigo: 'PERIORAL', nombreClinico: 'Región perioral', nombreVisible: 'Región perioral (código de barras)', grupo: TI, orden: 18,
    path: 'M 581.0 902.0 A 88 25 0 0 1 405.0 902.0 A 88 25 0 0 1 581.0 902.0 Z' },
  // Labios: UNA zona (superior + inferior juntos), por decisión del especialista.
  { codigo: 'LABIOS', nombreClinico: 'Labios', nombreVisible: 'Labios', grupo: TI, orden: 19,
    path: 'M 600.0 987.0 A 109 50 0 0 1 382.0 987.0 A 109 50 0 0 1 600.0 987.0 Z' },
  { codigo: 'COMISURA_DER', nombreClinico: 'Comisura labial', nombreVisible: 'Comisura labial · der', grupo: TI, orden: 20,
    path: 'M 365.0 980.0 A 29 36 0 0 1 307.0 980.0 A 29 36 0 0 1 365.0 980.0 Z' },
  { codigo: 'COMISURA_IZQ', nombreClinico: 'Comisura labial', nombreVisible: 'Comisura labial · izq', grupo: TI, orden: 21,
    path: 'M 672.0 983.0 A 29 36 0 0 1 614.0 983.0 A 29 36 0 0 1 672.0 983.0 Z' },
  { codigo: 'MARIONETA_DER', nombreClinico: 'Surco labiomentoniano', nombreVisible: 'Surco labiomentoniano (línea de marioneta) · der', grupo: TI, orden: 22,
    path: 'M 391.9 1049.6 A 25 56 6 0 1 342.1 1044.4 A 25 56 6 0 1 391.9 1049.6 Z' },
  { codigo: 'MARIONETA_IZQ', nombreClinico: 'Surco labiomentoniano', nombreVisible: 'Surco labiomentoniano (línea de marioneta) · izq', grupo: TI, orden: 23,
    path: 'M 649.9 1052.4 A 25 56 -6 0 1 600.1 1057.6 A 25 56 -6 0 1 649.9 1052.4 Z' },
  { codigo: 'MENTON', nombreClinico: 'Región mentoniana', nombreVisible: 'Región mentoniana (mentón)', grupo: TI, orden: 24,
    path: 'M 574.0 1109.0 A 79 37 0 0 1 416.0 1109.0 A 79 37 0 0 1 574.0 1109.0 Z' },
  { codigo: 'LINEA_MANDIBULAR_DER', nombreClinico: 'Reborde mandibular', nombreVisible: 'Reborde mandibular (línea mandibular) · der', grupo: TI, orden: 25,
    path: 'M 453.6 1181.7 A 194 25 40 0 1 156.4 932.3 A 194 25 40 0 1 453.6 1181.7 Z' },
  { codigo: 'LINEA_MANDIBULAR_IZQ', nombreClinico: 'Reborde mandibular', nombreVisible: 'Reborde mandibular (línea mandibular) · izq', grupo: TI, orden: 26,
    path: 'M 858.6 898.3 A 194 25 -40 0 1 561.4 1147.7 A 194 25 -40 0 1 858.6 898.3 Z' },
  { codigo: 'SUBMENTON', nombreClinico: 'Región submentoniana', nombreVisible: 'Región submentoniana (papada)', grupo: TI, orden: 27,
    path: 'M 590.0 1169.0 A 92 39 0 0 1 406.0 1169.0 A 92 39 0 0 1 590.0 1169.0 Z' },

  // ── Global ──
  // No es una zona anatómica: ancla tratamientos que no van a una región (peelings,
  // skinbooster, aparatología) sin ensuciar los datos. Se dibuja como anillo en el
  // borde del óvalo facial.
  { codigo: 'ROSTRO_COMPLETO', nombreClinico: 'Rostro completo', nombreVisible: 'Rostro completo', grupo: GL, orden: 28,
    path: 'M 492 154 A 394 536 0 1 0 492.1 154 Z M 492 187 A 361 503 0 1 1 491.9 187 Z' },
]
