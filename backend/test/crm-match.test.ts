import { describe, it, expect } from 'vitest'
import { clasificarVinculosHuerfanos, telCanonico, emailCanonico } from '@/services/crm.service'

// Clasificador de vínculos huérfanos lead→paciente (puro): RUT/email inequívocos,
// teléfono compartido = dudoso. Es la misma lógica que usan el script y el cron.
describe('clasificarVinculosHuerfanos', () => {
  it('matchea por EMAIL (insensible a mayúsculas) como inequívoco', () => {
    const pac = [{ id: 'p1', telefono: null, email: 'ana@mail.com', rut: null }]
    const leads = [{ id: 'l1', telefono: null, email: 'ANA@Mail.com', rut: null }]
    const { inequivocos, dudosos } = clasificarVinculosHuerfanos(pac, leads)
    expect(dudosos).toHaveLength(0)
    expect(inequivocos).toEqual([{ lead: leads[0], pacienteId: 'p1', via: 'correo' }])
  })

  it('matchea por teléfono en formatos distintos (+56 / espacios / guiones)', () => {
    const pac = [{ id: 'p1', telefono: '+56 9 5481 4817', email: null, rut: null }]
    const leads = [{ id: 'l1', telefono: '09-5481-4817', email: null, rut: null }]
    expect(clasificarVinculosHuerfanos(pac, leads).inequivocos[0]).toMatchObject({ pacienteId: 'p1', via: 'teléfono' })
  })

  it('RUT tiene prioridad sobre teléfono', () => {
    const pac = [{ id: 'p1', telefono: '12345678', email: null, rut: '11.111.111-1' }]
    const leads = [{ id: 'l1', telefono: '12345678', email: null, rut: '111111111' }]
    expect(clasificarVinculosHuerfanos(pac, leads).inequivocos[0]).toMatchObject({ pacienteId: 'p1', via: 'RUT' })
  })

  it('teléfono compartido por 2 leads sin vincular → dudoso (¿familia?)', () => {
    const pac = [{ id: 'p1', telefono: '+56 9 1111 2222', email: null, rut: null }]
    const leads = [
      { id: 'l1', telefono: '9 1111 2222', email: null, rut: null },
      { id: 'l2', telefono: '+56911112222', email: null, rut: null },
    ]
    const { inequivocos, dudosos } = clasificarVinculosHuerfanos(pac, leads)
    expect(inequivocos).toHaveLength(0)
    expect(dudosos).toHaveLength(2)
  })

  it('un lead que coincide con 2 pacientes → dudoso', () => {
    const pac = [{ id: 'p1', telefono: '91112222', email: null, rut: null }, { id: 'p2', telefono: '91112222', email: null, rut: null }]
    const leads = [{ id: 'l1', telefono: '91112222', email: null, rut: null }]
    expect(clasificarVinculosHuerfanos(pac, leads).dudosos[0].motivo).toMatch(/2 pacientes/)
  })

  it('sin coincidencia → ni inequívoco ni dudoso', () => {
    const r = clasificarVinculosHuerfanos([{ id: 'p1', telefono: '91112222', email: 'a@b.com', rut: null }], [{ id: 'l1', telefono: '93334444', email: 'c@d.com', rut: null }])
    expect(r.inequivocos).toHaveLength(0); expect(r.dudosos).toHaveLength(0)
  })
})

describe('normalización', () => {
  it('telCanonico unifica formatos chilenos', () => {
    expect(telCanonico('+56 9 5481 4817')).toBe(telCanonico('09-5481-4817'))
    expect(telCanonico('(45) 2 123 456')).toBe(telCanonico('452123456'))
  })
  it('emailCanonico normaliza y vacío→null', () => {
    expect(emailCanonico('  ANA@Mail.com ')).toBe('ana@mail.com')
    expect(emailCanonico('')).toBeNull()
  })
})
