// Utilidades de RUT chileno (módulo 11). Compartidas entre frontend y backend
// para que la validación del dígito verificador sea una sola fuente de verdad.

// Deja solo dígitos y la K (mayúscula), sin puntos ni guion.
export function limpiarRut(rut: string | null | undefined): string {
  return (rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase()
}

// Dígito verificador de un cuerpo (sin DV), por módulo 11.
export function calcularDV(cuerpo: string): string {
  let suma = 0
  let mul = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const resto = 11 - (suma % 11)
  if (resto === 11) return '0'
  if (resto === 10) return 'K'
  return String(resto)
}

// true si el RUT es válido (cuerpo numérico + DV correcto). Vacío → false.
export function validarRut(rut: string | null | undefined): boolean {
  const clean = limpiarRut(rut)
  if (clean.length < 2) return false
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1)
  if (!/^\d+$/.test(cuerpo)) return false
  return calcularDV(cuerpo) === dv
}

// Formato chileno con puntos y guion: 12.345.678-9. Si no alcanza, devuelve lo limpio.
export function formatRut(rut: string | null | undefined): string {
  const clean = limpiarRut(rut)
  if (clean.length < 2) return clean
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1)
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${conPuntos}-${dv}`
}
