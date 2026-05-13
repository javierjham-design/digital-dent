// Precios mensuales referenciales de la plataforma (CLP).
// Hardcodeados hasta que exista pasarela de pagos (Fase 4).
// El super-admin puede ver el MRR estimado y los cobros esperados por clínica.

export const PLAN_PRICES: Record<string, number> = {
  TRIAL:   0,
  BASICO:  19900,
  PRO:     39900,
}

export const PLAN_LABELS: Record<string, string> = {
  TRIAL:   'Prueba (30 días)',
  BASICO:  'Básico',
  PRO:     'Pro',
}

export const PLAN_DESCRIPCIONES: Record<string, string> = {
  TRIAL:   'Acceso completo por 30 días sin cobro.',
  BASICO:  'Funcionalidades core: pacientes, agenda, presupuestos, cobros.',
  PRO:     'Todo + soporte prioritario y módulo de archivos (radiografías).',
}
