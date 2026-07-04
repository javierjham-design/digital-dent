// Catálogo de países para la operación multi-país. La BASE es Chile; el país se
// define POR CLÍNICA desde el super-admin. Define, por país: documento (etiqueta
// + validación), teléfono (código + largo) y moneda (código + símbolo + locale +
// decimales). Validación FINA para Chile/Costa Rica/Panamá; el resto de LatAm y
// Centroamérica queda seleccionable con validación genérica (formato/largo).
// Fuente única compartida entre frontend y backend.

import { validarRut, formatRut } from '../utils/rut'

export interface PaisMoneda { code: string; simbolo: string; locale: string; decimales: number }
export interface PaisConfig {
  code: string          // ISO-3166 alfa-2
  nombre: string
  bandera: string       // emoji
  doc: {
    label: string       // RUT / Cédula / DNI / DPI…
    placeholder: string
    validar: (v: string) => boolean   // true = válido; países sin DV público = flexible
    formatear?: (v: string) => string // normaliza al salir del campo (opcional)
  }
  tel: { codigo: string; largo: number; placeholder: string } // largo = dígitos nacionales
  moneda: PaisMoneda
}

export const PAIS_DEFAULT = 'CL'

const soloDigitos = (v: string) => (v ?? '').replace(/\D/g, '')
// Validación genérica flexible: 5–20 caracteres (sin puntos/espacios).
const docFlexible = (v: string) => { const c = (v ?? '').trim().replace(/[.\s]/g, ''); return c.length >= 5 && c.length <= 20 }

// Helper para los países con validación genérica.
function generico(
  code: string, nombre: string, bandera: string, label: string, phDoc: string,
  codigo: string, largo: number, phTel: string,
  mcode: string, simbolo: string, locale: string, decimales: number,
): PaisConfig {
  return {
    code, nombre, bandera,
    doc: { label, placeholder: phDoc, validar: docFlexible },
    tel: { codigo, largo, placeholder: phTel },
    moneda: { code: mcode, simbolo, locale, decimales },
  }
}

export const PAISES: Record<string, PaisConfig> = {
  // ── Validación fina ──────────────────────────────────────────────────────
  CL: {
    code: 'CL', nombre: 'Chile', bandera: '🇨🇱',
    doc: { label: 'RUT', placeholder: '12.345.678-9', validar: validarRut, formatear: formatRut },
    tel: { codigo: '+56', largo: 9, placeholder: '9 1234 5678' },
    moneda: { code: 'CLP', simbolo: '$', locale: 'es-CL', decimales: 0 },
  },
  CR: {
    code: 'CR', nombre: 'Costa Rica', bandera: '🇨🇷',
    doc: { label: 'Cédula / DIMEX', placeholder: '1-2345-6789', validar: (v) => { const d = soloDigitos(v); return d.length >= 9 && d.length <= 12 } },
    tel: { codigo: '+506', largo: 8, placeholder: '8123 4567' },
    moneda: { code: 'CRC', simbolo: '₡', locale: 'es-CR', decimales: 0 },
  },
  PA: {
    code: 'PA', nombre: 'Panamá', bandera: '🇵🇦',
    doc: { label: 'Cédula', placeholder: '8-123-4567', validar: (v) => { const c = (v ?? '').trim().toUpperCase().replace(/\s/g, ''); return /^(PE|E|N)?-?\d{1,2}-\d{1,4}-\d{1,6}$/.test(c) || soloDigitos(v).length >= 6 } },
    tel: { codigo: '+507', largo: 8, placeholder: '6123 4567' },
    moneda: { code: 'PAB', simbolo: 'B/.', locale: 'en-US', decimales: 2 },
  },
  // ── Resto de LatAm / Centroamérica (validación genérica) ─────────────────
  AR: generico('AR', 'Argentina', '🇦🇷', 'DNI', '12.345.678', '+54', 10, '11 2345 6789', 'ARS', '$', 'es-AR', 2),
  UY: generico('UY', 'Uruguay', '🇺🇾', 'Cédula', '1.234.567-8', '+598', 8, '9 123 4567', 'UYU', '$', 'es-UY', 2),
  PY: generico('PY', 'Paraguay', '🇵🇾', 'Cédula', '1234567', '+595', 9, '9 812 34567', 'PYG', '₲', 'es-PY', 0),
  BO: generico('BO', 'Bolivia', '🇧🇴', 'Cédula', '1234567', '+591', 8, '7 123 4567', 'BOB', 'Bs', 'es-BO', 2),
  PE: generico('PE', 'Perú', '🇵🇪', 'DNI', '12345678', '+51', 9, '912 345 678', 'PEN', 'S/', 'es-PE', 2),
  EC: generico('EC', 'Ecuador', '🇪🇨', 'Cédula', '1234567890', '+593', 9, '99 123 4567', 'USD', '$', 'es-EC', 2),
  CO: generico('CO', 'Colombia', '🇨🇴', 'Cédula', '12.345.678', '+57', 10, '312 345 6789', 'COP', '$', 'es-CO', 0),
  VE: generico('VE', 'Venezuela', '🇻🇪', 'Cédula', 'V-12345678', '+58', 10, '412 345 6789', 'VES', 'Bs', 'es-VE', 2),
  MX: generico('MX', 'México', '🇲🇽', 'CURP / INE', 'GODE561231...', '+52', 10, '55 1234 5678', 'MXN', '$', 'es-MX', 2),
  GT: generico('GT', 'Guatemala', '🇬🇹', 'DPI', '1234 56789 0101', '+502', 8, '5123 4567', 'GTQ', 'Q', 'es-GT', 2),
  SV: generico('SV', 'El Salvador', '🇸🇻', 'DUI', '01234567-8', '+503', 8, '7123 4567', 'USD', '$', 'es-SV', 2),
  HN: generico('HN', 'Honduras', '🇭🇳', 'DNI', '0801-1990-12345', '+504', 8, '9123 4567', 'HNL', 'L', 'es-HN', 2),
  NI: generico('NI', 'Nicaragua', '🇳🇮', 'Cédula', '001-120390-1000A', '+505', 8, '8123 4567', 'NIO', 'C$', 'es-NI', 2),
  DO: generico('DO', 'Rep. Dominicana', '🇩🇴', 'Cédula', '001-1234567-8', '+1', 10, '809 123 4567', 'DOP', 'RD$', 'es-DO', 2),
}

export const PAISES_LISTA: PaisConfig[] = Object.values(PAISES)

export function getPais(code?: string | null): PaisConfig {
  return PAISES[(code ?? PAIS_DEFAULT).toUpperCase()] ?? PAISES[PAIS_DEFAULT]
}
export function esPaisValido(code?: string | null): boolean {
  return Boolean(code && PAISES[String(code).toUpperCase()])
}

// Moneda: símbolo + número con separadores/decimales del país. Ej: $1.234.567 (CL),
// ₡1.234.567 (CR), B/.1,234.56 (PA).
export function formatMoneda(paisCode: string | null | undefined, monto: number): string {
  const m = getPais(paisCode).moneda
  const n = new Intl.NumberFormat(m.locale, { minimumFractionDigits: m.decimales, maximumFractionDigits: m.decimales })
    .format(Number.isFinite(monto) ? monto : 0)
  return `${m.simbolo}${n}`
}

export function docLabel(paisCode?: string | null): string { return getPais(paisCode).doc.label }
export function validarDoc(paisCode: string | null | undefined, v: string): boolean { return getPais(paisCode).doc.validar(v ?? '') }
export function formatDoc(paisCode: string | null | undefined, v: string): string {
  const f = getPais(paisCode).doc.formatear
  return f ? f(v) : v
}
