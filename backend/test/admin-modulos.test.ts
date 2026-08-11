import { describe, it, expect } from 'vitest'
import { sanitizarModulos } from '@/services/admin.service'

// Regresión: guardar módulos desde el Super Admin NO debe borrar los módulos de
// área (area_dental/estetica/medico). Antes se filtraba solo por los comerciales.
describe('sanitizarModulos (módulos comerciales + áreas)', () => {
  it('conserva módulos comerciales Y de área', () => {
    const r = sanitizarModulos(['crm', 'agendamiento_online', 'whatsapp', 'area_dental', 'area_estetica'])
    expect(r).toContain('area_dental')
    expect(r).toContain('area_estetica')
    expect(r).toContain('crm')
  })

  it('descarta códigos desconocidos', () => {
    expect(sanitizarModulos(['crm', 'area_dental', 'inventado', ''])).toEqual(['crm', 'area_dental'])
  })

  it('elimina duplicados', () => {
    expect(sanitizarModulos(['crm', 'crm', 'area_dental', 'area_dental'])).toEqual(['crm', 'area_dental'])
  })

  it('habilitar solo comerciales ya NO borra el área si el panel la manda', () => {
    // El panel manda el set completo: comerciales elegidos + áreas elegidas.
    const r = sanitizarModulos(['crm', 'area_dental', 'area_medico'])
    expect(r).toEqual(['crm', 'area_dental', 'area_medico'])
  })
})
