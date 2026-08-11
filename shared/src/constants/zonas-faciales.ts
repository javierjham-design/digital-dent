// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ CATÁLOGO PROVISIONAL DE ZONAS FACIALES — EN REVISIÓN PROFESIONAL ⚠️⚠️
//
// Fuente: docs/ZONAS_FACIALES_PROPUESTA.md (núcleo). Hay 6 PREGUNTAS ABIERTAS que
// pueden cambiar códigos: labios juntos o separados · lateralidad del perioral ·
// masetero como zona propia · mapeo de bichectomía · si el mapa llega al cuello ·
// nomenclatura visible. NO habilitar area_estetica a ninguna clínica REAL hasta
// congelar esta lista: el código queda grabado en cada tratamiento y cambiarlo
// después implica migrar datos clínicos. Hoy el cambio es GRATIS (cero tratamientos
// cargados). ESTE ARCHIVO ES LA ÚNICA FUENTE del catálogo: el seed del backend y el
// mapa del frontend leen de acá — un cambio de lista se hace SOLO acá.
//
// Nota de conteo: el título de la propuesta dice "28 zonas" pero sus tablas del
// núcleo enumeran 32 filas (11 conceptos bilaterales ×2 + 10 mediales/global).
// Se cargan las 32 de las tablas; el número del título queda para conciliar en la
// revisión profesional.
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
  { codigo: 'FRENTE', nombreClinico: 'Región frontal', nombreVisible: 'Frente', grupo: TS, orden: 0,
    path: 'M 646.0 330.0 A 171 74 0 0 1 304.0 330.0 A 171 74 0 0 1 646.0 330.0 Z' },
  { codigo: 'GLABELA', nombreClinico: 'Complejo glabelar', nombreVisible: 'Entrecejo', grupo: TS, orden: 1,
    path: 'M 512.0 440.0 A 39 30 0 0 1 434.0 440.0 A 39 30 0 0 1 512.0 440.0 Z' },
  { codigo: 'COLA_CEJA_DER', nombreClinico: 'Cola de ceja', nombreVisible: 'Cola de ceja (der)', grupo: TS, orden: 2,
    path: 'M 342.6 440.6 A 39 16 -8 0 1 265.4 451.4 A 39 16 -8 0 1 342.6 440.6 Z' },
  { codigo: 'COLA_CEJA_IZQ', nombreClinico: 'Cola de ceja', nombreVisible: 'Cola de ceja (izq)', grupo: TS, orden: 3,
    path: 'M 674.6 456.4 A 39 16 8 0 1 597.4 445.6 A 39 16 8 0 1 674.6 456.4 Z' },
  { codigo: 'PERIORBITAL_LAT_DER', nombreClinico: 'Región periorbitaria lateral', nombreVisible: 'Patas de gallo (der)', grupo: TS, orden: 4,
    path: 'M 284.7 436.2 A 30 42 8 0 1 225.3 427.8 A 30 42 8 0 1 284.7 436.2 Z' },
  { codigo: 'PERIORBITAL_LAT_IZQ', nombreClinico: 'Región periorbitaria lateral', nombreVisible: 'Patas de gallo (izq)', grupo: TS, orden: 5,
    path: 'M 725.7 443.8 A 30 42 -8 0 1 666.3 452.2 A 30 42 -8 0 1 725.7 443.8 Z' },
  { codigo: 'TEMPORAL_DER', nombreClinico: 'Región temporal', nombreVisible: 'Sien (der)', grupo: TS, orden: 6,
    path: 'M 226.9 355.6 A 25 42 6 0 1 177.1 350.4 A 25 42 6 0 1 226.9 355.6 Z' },
  { codigo: 'TEMPORAL_IZQ', nombreClinico: 'Región temporal', nombreVisible: 'Sien (izq)', grupo: TS, orden: 7,
    path: 'M 761.9 352.4 A 25 42 -6 0 1 712.1 357.6 A 25 42 -6 0 1 761.9 352.4 Z' },

  // ── Tercio medio ──
  { codigo: 'SURCO_LAGRIMAL_DER', nombreClinico: 'Surco lagrimal', nombreVisible: 'Ojera (der)', grupo: TM, orden: 8,
    path: 'M 419.5 533.8 A 52 18 -8 0 1 316.5 548.2 A 52 18 -8 0 1 419.5 533.8 Z' },
  { codigo: 'SURCO_LAGRIMAL_IZQ', nombreClinico: 'Surco lagrimal', nombreVisible: 'Ojera (izq)', grupo: TM, orden: 9,
    path: 'M 630.5 544.2 A 52 18 8 0 1 527.5 529.8 A 52 18 8 0 1 630.5 544.2 Z' },
  { codigo: 'MALAR_DER', nombreClinico: 'Región malar', nombreVisible: 'Pómulo (der)', grupo: TM, orden: 10,
    path: 'M 387.6 616.3 A 64 46 12 0 1 262.4 589.7 A 64 46 12 0 1 387.6 616.3 Z' },
  { codigo: 'MALAR_IZQ', nombreClinico: 'Región malar', nombreVisible: 'Pómulo (izq)', grupo: TM, orden: 11,
    path: 'M 676.6 586.7 A 64 46 -12 0 1 551.4 613.3 A 64 46 -12 0 1 676.6 586.7 Z' },
  { codigo: 'SUBMALAR_DER', nombreClinico: 'Región submalar', nombreVisible: 'Hueco de la mejilla (der)', grupo: TM, orden: 12,
    path: 'M 403.6 683.4 A 46 36 8 0 1 312.4 670.6 A 46 36 8 0 1 403.6 683.4 Z' },
  { codigo: 'SUBMALAR_IZQ', nombreClinico: 'Región submalar', nombreVisible: 'Hueco de la mejilla (izq)', grupo: TM, orden: 13,
    path: 'M 636.6 667.6 A 46 36 -8 0 1 545.4 680.4 A 46 36 -8 0 1 636.6 667.6 Z' },
  { codigo: 'SURCO_NASOGENIANO_DER', nombreClinico: 'Surco nasogeniano', nombreVisible: 'Surco nasogeniano (der)', grupo: TM, orden: 14,
    path: 'M 373.4 726.1 A 18 58 108 0 1 384.6 691.9 A 18 58 108 0 1 373.4 726.1 Z' },
  { codigo: 'SURCO_NASOGENIANO_IZQ', nombreClinico: 'Surco nasogeniano', nombreVisible: 'Surco nasogeniano (izq)', grupo: TM, orden: 15,
    path: 'M 564.4 698.9 A 18 58 -108 0 1 575.6 733.1 A 18 58 -108 0 1 564.4 698.9 Z' },
  { codigo: 'DORSO_NASAL', nombreClinico: 'Dorso nasal', nombreVisible: 'Dorso de la nariz', grupo: TM, orden: 16,
    path: 'M 500.0 545.0 A 30 112 0 0 1 440.0 545.0 A 30 112 0 0 1 500.0 545.0 Z' },
  { codigo: 'PUNTA_NASAL', nombreClinico: 'Punta nasal', nombreVisible: 'Punta de la nariz', grupo: TM, orden: 17,
    path: 'M 513.0 653.0 A 46 30 0 0 1 421.0 653.0 A 46 30 0 0 1 513.0 653.0 Z' },

  // ── Tercio inferior ──
  { codigo: 'PERIORAL', nombreClinico: 'Región perioral', nombreVisible: 'Líneas del labio', grupo: TI, orden: 18,
    path: 'M 553.0 769.0 A 87 40 0 0 1 379.0 769.0 A 87 40 0 0 1 553.0 769.0 Z' },
  { codigo: 'LABIO_SUPERIOR', nombreClinico: 'Labio superior', nombreVisible: 'Labio superior', grupo: TI, orden: 19,
    path: 'M 526.0 748.0 A 59 15 0 0 1 408.0 748.0 A 59 15 0 0 1 526.0 748.0 Z' },
  { codigo: 'LABIO_INFERIOR', nombreClinico: 'Labio inferior', nombreVisible: 'Labio inferior', grupo: TI, orden: 20,
    path: 'M 520.0 787.0 A 55 18 0 0 1 410.0 787.0 A 55 18 0 0 1 520.0 787.0 Z' },
  { codigo: 'COMISURA_DER', nombreClinico: 'Comisura labial', nombreVisible: 'Comisura (der)', grupo: TI, orden: 21,
    path: 'M 376.0 766.0 A 21 26 0 0 1 334.0 766.0 A 21 26 0 0 1 376.0 766.0 Z' },
  { codigo: 'COMISURA_IZQ', nombreClinico: 'Comisura labial', nombreVisible: 'Comisura (izq)', grupo: TI, orden: 22,
    path: 'M 591.0 777.0 A 21 26 0 0 1 549.0 777.0 A 21 26 0 0 1 591.0 777.0 Z' },
  { codigo: 'MARIONETA_DER', nombreClinico: 'Surco labiomentoniano', nombreVisible: 'Línea de marioneta (der)', grupo: TI, orden: 23,
    path: 'M 395.9 811.9 A 18 40 6 0 1 360.1 808.1 A 18 40 6 0 1 395.9 811.9 Z' },
  { codigo: 'MARIONETA_IZQ', nombreClinico: 'Surco labiomentoniano', nombreVisible: 'Línea de marioneta (izq)', grupo: TI, orden: 24,
    path: 'M 587.9 796.1 A 18 40 -6 0 1 552.1 799.9 A 18 40 -6 0 1 587.9 796.1 Z' },
  { codigo: 'MENTON', nombreClinico: 'Región mentoniana', nombreVisible: 'Mentón', grupo: TI, orden: 25,
    path: 'M 525.0 860.0 A 57 44 0 0 1 411.0 860.0 A 57 44 0 0 1 525.0 860.0 Z' },
  { codigo: 'LINEA_MANDIBULAR_DER', nombreClinico: 'Reborde mandibular', nombreVisible: 'Línea mandibular (der)', grupo: TI, orden: 26,
    path: 'M 440.2 907.0 A 140 18 40 0 1 225.8 727.0 A 140 18 40 0 1 440.2 907.0 Z' },
  { codigo: 'LINEA_MANDIBULAR_IZQ', nombreClinico: 'Reborde mandibular', nombreVisible: 'Línea mandibular (izq)', grupo: TI, orden: 27,
    path: 'M 732.2 703.0 A 140 18 -40 0 1 517.8 883.0 A 140 18 -40 0 1 732.2 703.0 Z' },
  { codigo: 'MASETERO_DER', nombreClinico: 'Músculo masetero', nombreVisible: 'Masetero (der)', grupo: TI, orden: 28,
    path: 'M 287.5 685.4 A 32 54 -10 0 1 224.5 696.6 A 32 54 -10 0 1 287.5 685.4 Z' },
  { codigo: 'MASETERO_IZQ', nombreClinico: 'Músculo masetero', nombreVisible: 'Masetero (izq)', grupo: TI, orden: 29,
    path: 'M 718.5 676.6 A 32 54 10 0 1 655.5 665.4 A 32 54 10 0 1 718.5 676.6 Z' },
  { codigo: 'SUBMENTON', nombreClinico: 'Región submentoniana', nombreVisible: 'Papada', grupo: TI, orden: 30,
    path: 'M 528.0 918.0 A 66 28 0 0 1 396.0 918.0 A 66 28 0 0 1 528.0 918.0 Z' },

  // ── Global ──
  // No es una zona anatómica: ancla tratamientos que no van a una región (peelings,
  // skinbooster, aparatología) sin ensuciar los datos. Se dibuja como anillo en el
  // borde del óvalo facial.
  { codigo: 'ROSTRO_COMPLETO', nombreClinico: 'Rostro completo', nombreVisible: 'Rostro completo', grupo: GL, orden: 31,
    path: 'M 468 167 A 284 386 0 1 0 468.1 167 Z M 468 191 A 260 362 0 1 1 467.9 191 Z' },
]
