import { describe, it, expect } from 'vitest'
import { slugify } from '@/services/clinicas-registry.service'
import { dbNameForSlug } from '@/lib/provision'

describe('slugify (alta de clínicas)', () => {
  it('normaliza nombre a slug', () => {
    expect(slugify('Clínica Dental Sonríe')).toBe('clinica-dental-sonrie')
    expect(slugify('Centro Médico Ñuñoa')).toBe('centro-medico-nunoa')
  })
  it('colapsa separadores y recorta extremos', () => {
    expect(slugify('  Hola --- Mundo!!  ')).toBe('hola-mundo')
  })
  it('el slug resultante produce un dbName válido', () => {
    const slug = slugify('Clínica Dental Sonríe')
    expect(dbNameForSlug(slug)).toBe('clariva_t_clinica_dental_sonrie')
  })
})
