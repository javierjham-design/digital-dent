// Áreas clínicas: DENTAL · ESTETICA · MEDICO. Un área está disponible para un
// profesional solo si la clínica la contrató (módulo `area_*` en el control-plane)
// Y el usuario la tiene habilitada (flags booleanos en User).
//
// El área de una PRESTACIÓN se deriva de su categoría (CategoriaPrestacion.area);
// el área de un TRATAMIENTO, de la categoría de su prestación. El área NO vive en
// PlanTratamiento: un mismo plan puede mezclar acciones dentales y estéticas.

export const AREAS = ['DENTAL', 'ESTETICA', 'MEDICO'] as const
export type AreaClinica = (typeof AREAS)[number]

export const AREA_LABELS: Record<AreaClinica, string> = {
  DENTAL: 'Dental',
  ESTETICA: 'Estética facial',
  MEDICO: 'Médico',
}

export function esArea(v: string | null | undefined): v is AreaClinica {
  return AREAS.includes((v ?? '') as AreaClinica)
}

// Módulo comercial (control-plane) que habilita cada área en una clínica.
export const MODULO_POR_AREA: Record<AreaClinica, string> = {
  DENTAL: 'area_dental',
  ESTETICA: 'area_estetica',
  MEDICO: 'area_medico',
}
export const MODULOS_AREA_CODES = Object.values(MODULO_POR_AREA)

// Área con la que nace una clínica según su vertical comercial (lib/verticales).
export const AREA_POR_VERTICAL: Record<string, AreaClinica> = {
  dental: 'DENTAL',
  estetica: 'ESTETICA',
  medico: 'MEDICO',
}

// Flag del modelo User (tenant) que habilita cada área a un profesional.
export const FLAG_POR_AREA: Record<AreaClinica, 'areaDental' | 'areaEstetica' | 'areaMedico'> = {
  DENTAL: 'areaDental',
  ESTETICA: 'areaEstetica',
  MEDICO: 'areaMedico',
}

// Áreas contratadas por una clínica a partir de su CSV de módulos. Si no tiene
// NINGÚN módulo de área, es una clínica anterior al módulo de áreas: se trata
// como DENTAL, pero eso lo decide el caller (con log ruidoso), no esta función.
export function areasDeModulos(modulos: string[] | string | null | undefined): AreaClinica[] {
  const arr = Array.isArray(modulos) ? modulos : (modulos ?? '').split(',').map((s) => s.trim())
  return AREAS.filter((a) => arr.includes(MODULO_POR_AREA[a]))
}
