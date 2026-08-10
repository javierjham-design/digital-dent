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
// `path` es la geometría del PLACEHOLDER (viewBox 0 0 1000 1300); la ilustración
// definitiva la reemplaza path por path manteniendo los ids `zona-{codigo}`
// (contrato en docs/SVG_ROSTRO_CONTRATO.md).

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
    path: 'M 330 255 Q 500 195 670 255 L 655 355 Q 500 315 345 355 Z' },
  { codigo: 'GLABELA', nombreClinico: 'Complejo glabelar', nombreVisible: 'Entrecejo', grupo: TS, orden: 1,
    path: 'M 458 372 L 542 372 L 534 452 L 466 452 Z' },
  { codigo: 'COLA_CEJA_DER', nombreClinico: 'Cola de ceja', nombreVisible: 'Cola de ceja (der)', grupo: TS, orden: 2,
    path: 'M 302 396 L 368 384 L 374 420 L 310 432 Z' },
  { codigo: 'COLA_CEJA_IZQ', nombreClinico: 'Cola de ceja', nombreVisible: 'Cola de ceja (izq)', grupo: TS, orden: 3,
    path: 'M 632 384 L 698 396 L 690 432 L 626 420 Z' },
  { codigo: 'PERIORBITAL_LAT_DER', nombreClinico: 'Región periorbitaria lateral', nombreVisible: 'Patas de gallo (der)', grupo: TS, orden: 4,
    path: 'M 288 470 L 348 460 L 354 548 L 296 556 Z' },
  { codigo: 'PERIORBITAL_LAT_IZQ', nombreClinico: 'Región periorbitaria lateral', nombreVisible: 'Patas de gallo (izq)', grupo: TS, orden: 5,
    path: 'M 652 460 L 712 470 L 704 556 L 646 548 Z' },
  { codigo: 'TEMPORAL_DER', nombreClinico: 'Región temporal', nombreVisible: 'Sien (der)', grupo: TS, orden: 6,
    path: 'M 238 352 L 296 340 L 302 448 L 246 456 Z' },
  { codigo: 'TEMPORAL_IZQ', nombreClinico: 'Región temporal', nombreVisible: 'Sien (izq)', grupo: TS, orden: 7,
    path: 'M 704 340 L 762 352 L 754 456 L 698 448 Z' },

  // ── Tercio medio ──
  { codigo: 'SURCO_LAGRIMAL_DER', nombreClinico: 'Surco lagrimal', nombreVisible: 'Ojera (der)', grupo: TM, orden: 8,
    path: 'M 352 520 Q 400 540 446 528 L 442 562 Q 396 572 356 552 Z' },
  { codigo: 'SURCO_LAGRIMAL_IZQ', nombreClinico: 'Surco lagrimal', nombreVisible: 'Ojera (izq)', grupo: TM, orden: 9,
    path: 'M 554 528 Q 600 540 648 520 L 644 552 Q 604 572 558 562 Z' },
  { codigo: 'MALAR_DER', nombreClinico: 'Región malar', nombreVisible: 'Pómulo (der)', grupo: TM, orden: 10,
    path: 'M 300 575 Q 365 560 412 585 L 400 655 Q 340 660 305 635 Z' },
  { codigo: 'MALAR_IZQ', nombreClinico: 'Región malar', nombreVisible: 'Pómulo (izq)', grupo: TM, orden: 11,
    path: 'M 588 585 Q 635 560 700 575 L 695 635 Q 660 660 600 655 Z' },
  { codigo: 'SUBMALAR_DER', nombreClinico: 'Región submalar', nombreVisible: 'Hueco de la mejilla (der)', grupo: TM, orden: 12,
    path: 'M 315 665 Q 365 675 398 668 L 388 748 Q 345 750 322 728 Z' },
  { codigo: 'SUBMALAR_IZQ', nombreClinico: 'Región submalar', nombreVisible: 'Hueco de la mejilla (izq)', grupo: TM, orden: 13,
    path: 'M 602 668 Q 635 675 685 665 L 678 728 Q 655 750 612 748 Z' },
  { codigo: 'SURCO_NASOGENIANO_DER', nombreClinico: 'Surco nasogeniano', nombreVisible: 'Surco nasogeniano (der)', grupo: TM, orden: 14,
    path: 'M 408 662 L 448 682 L 432 778 L 398 742 Z' },
  { codigo: 'SURCO_NASOGENIANO_IZQ', nombreClinico: 'Surco nasogeniano', nombreVisible: 'Surco nasogeniano (izq)', grupo: TM, orden: 15,
    path: 'M 552 682 L 592 662 L 602 742 L 568 778 Z' },
  { codigo: 'DORSO_NASAL', nombreClinico: 'Dorso nasal', nombreVisible: 'Dorso de la nariz', grupo: TM, orden: 16,
    path: 'M 472 478 L 528 478 L 534 622 L 466 622 Z' },
  { codigo: 'PUNTA_NASAL', nombreClinico: 'Punta nasal', nombreVisible: 'Punta de la nariz', grupo: TM, orden: 17,
    path: 'M 462 632 Q 500 618 538 632 L 530 690 Q 500 702 470 690 Z' },

  // ── Tercio inferior ──
  { codigo: 'PERIORAL', nombreClinico: 'Región perioral', nombreVisible: 'Líneas del labio', grupo: TI, orden: 18,
    path: 'M 422 752 Q 500 730 578 752 L 572 782 Q 500 762 428 782 Z' },
  { codigo: 'LABIO_SUPERIOR', nombreClinico: 'Labio superior', nombreVisible: 'Labio superior', grupo: TI, orden: 19,
    path: 'M 428 795 Q 500 772 572 795 L 566 838 Q 500 820 434 838 Z' },
  { codigo: 'LABIO_INFERIOR', nombreClinico: 'Labio inferior', nombreVisible: 'Labio inferior', grupo: TI, orden: 20,
    path: 'M 434 848 Q 500 832 566 848 L 558 896 Q 500 912 442 896 Z' },
  { codigo: 'COMISURA_DER', nombreClinico: 'Comisura labial', nombreVisible: 'Comisura (der)', grupo: TI, orden: 21,
    path: 'M 388 812 L 424 822 L 418 866 L 384 854 Z' },
  { codigo: 'COMISURA_IZQ', nombreClinico: 'Comisura labial', nombreVisible: 'Comisura (izq)', grupo: TI, orden: 22,
    path: 'M 576 822 L 612 812 L 616 854 L 582 866 Z' },
  { codigo: 'MARIONETA_DER', nombreClinico: 'Surco labiomentoniano', nombreVisible: 'Línea de marioneta (der)', grupo: TI, orden: 23,
    path: 'M 382 876 L 420 884 L 410 962 L 376 948 Z' },
  { codigo: 'MARIONETA_IZQ', nombreClinico: 'Surco labiomentoniano', nombreVisible: 'Línea de marioneta (izq)', grupo: TI, orden: 24,
    path: 'M 580 884 L 618 876 L 624 948 L 590 962 Z' },
  { codigo: 'MENTON', nombreClinico: 'Región mentoniana', nombreVisible: 'Mentón', grupo: TI, orden: 25,
    path: 'M 442 928 Q 500 910 558 928 L 548 1022 Q 500 1042 452 1022 Z' },
  { codigo: 'LINEA_MANDIBULAR_DER', nombreClinico: 'Reborde mandibular', nombreVisible: 'Línea mandibular (der)', grupo: TI, orden: 26,
    path: 'M 262 790 L 310 800 L 400 966 L 356 986 Q 290 900 262 790 Z' },
  { codigo: 'LINEA_MANDIBULAR_IZQ', nombreClinico: 'Reborde mandibular', nombreVisible: 'Línea mandibular (izq)', grupo: TI, orden: 27,
    path: 'M 690 800 L 738 790 Q 710 900 644 986 L 600 966 Z' },
  { codigo: 'MASETERO_DER', nombreClinico: 'Músculo masetero', nombreVisible: 'Masetero (der)', grupo: TI, orden: 28,
    path: 'M 278 700 L 340 712 L 348 810 L 292 792 Z' },
  { codigo: 'MASETERO_IZQ', nombreClinico: 'Músculo masetero', nombreVisible: 'Masetero (izq)', grupo: TI, orden: 29,
    path: 'M 660 712 L 722 700 L 708 792 L 652 810 Z' },
  { codigo: 'SUBMENTON', nombreClinico: 'Región submentoniana', nombreVisible: 'Papada', grupo: TI, orden: 30,
    path: 'M 415 1055 Q 500 1030 585 1055 L 572 1128 Q 500 1150 428 1128 Z' },

  // ── Global ──
  // No es una zona anatómica: ancla tratamientos que no van a una región (peelings,
  // skinbooster, aparatología) sin ensuciar los datos. Se dibuja como anillo en el
  // borde del óvalo facial.
  { codigo: 'ROSTRO_COMPLETO', nombreClinico: 'Rostro completo', nombreVisible: 'Rostro completo', grupo: GL, orden: 31,
    path: 'M 500 185 A 322 432 0 1 0 500.1 185 Z M 500 225 A 285 395 0 1 1 499.9 225 Z' },
]
