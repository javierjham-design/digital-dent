import { formatMoneda } from '@shared/constants/paises'

// Moneda país-aware. El país de la clínica se fija una vez (desde la sesión) con
// setPaisMoneda; las pantallas formatean con fmtMonto y se adaptan (CLP $, CRC ₡,
// PAB B/., etc.). La BASE es Chile mientras no se configure otro país.
let _pais = 'CL'
export function setPaisMoneda(code?: string | null) { _pais = (code || 'CL').toUpperCase() }
export function paisMoneda(): string { return _pais }
export function fmtMonto(n?: number | null): string { return formatMoneda(_pais, Number(n ?? 0)) }
