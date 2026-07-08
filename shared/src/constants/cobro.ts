// Moneda de COBRO de la suscripción (lo que paga la clínica a la plataforma).
// Regla de negocio: Chile paga en CLP; el resto de los países en USD. El
// super-admin puede forzar una moneda por clínica (override).

export type MonedaCobro = 'CLP' | 'USD'

export const MONEDAS_COBRO: MonedaCobro[] = ['CLP', 'USD']

// Moneda por defecto según el país de operación de la clínica.
export function monedaCobroPorPais(pais: string): MonedaCobro {
  return (pais || 'CL').toUpperCase() === 'CL' ? 'CLP' : 'USD'
}

// Moneda efectiva de cobro: override del super-admin, o la del país.
export function monedaCobroDe(pais: string, override?: string | null): MonedaCobro {
  const o = (override ?? '').toUpperCase()
  if (o === 'CLP' || o === 'USD') return o
  return monedaCobroPorPais(pais)
}

// Formatea un monto en la moneda de cobro (CLP sin decimales; USD con 2).
export function fmtCobro(monto: number, moneda: MonedaCobro): string {
  if (moneda === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(monto)
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(monto)
}
