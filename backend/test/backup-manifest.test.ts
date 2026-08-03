import { describe, it, expect } from 'vitest'
import { parseManifest, tryParseManifest, serializeManifest, entradaDeBase, type BackupManifest } from '@/lib/backup/manifest'
import { compararCenso } from '@/lib/backup/census'

const manifiestoValido: BackupManifest = {
  version: 1,
  iso: '2026-08-03T07:00:00.000Z',
  disparadoPor: 'cron',
  incluirDemos: false,
  bases: [
    { dbName: 'clariva_control', slug: 'control', esControl: true, key: 'clariva/2026/08/03/clariva_control__x.dump.enc', bytes: 123, sha256: 'abc', duracionMs: 900, censo: { Clinica: 2 }, ok: true },
    { dbName: 'clariva_t_digital_dent', slug: 'digital-dent', key: 'clariva/2026/08/03/clariva_t_digital_dent__x.dump.enc', bytes: 456, sha256: 'def', duracionMs: 1200, censo: { Paciente: 6548, Cita: 139, Cobro: 40, Tratamiento: 12, PlanTratamiento: 3, Liquidacion: 1 }, ok: true },
    { dbName: 'clariva_t_falla', slug: 'falla', key: null, bytes: 0, sha256: null, duracionMs: 5, censo: {}, ok: false, error: 'pg_dump salió con código 1' },
  ],
}

describe('backup manifest', () => {
  it('serializa y re-parsea sin pérdida', () => {
    const buf = serializeManifest(manifiestoValido)
    const parsed = parseManifest(buf.toString('utf8'))
    expect(parsed).toEqual(manifiestoValido)
  })

  it('rechaza un manifiesto inválido (falta un campo requerido)', () => {
    const malo = { ...manifiestoValido, version: 2 }
    expect(() => parseManifest(malo)).toThrow()
    expect(tryParseManifest(malo)).toBeNull()
    expect(tryParseManifest('no es json {')).toBeNull()
  })

  it('entradaDeBase encuentra la entrada OK por slug o dbName e ignora las fallidas', () => {
    expect(entradaDeBase(manifiestoValido, 'digital-dent')?.dbName).toBe('clariva_t_digital_dent')
    expect(entradaDeBase(manifiestoValido, 'clariva_t_digital_dent')?.slug).toBe('digital-dent')
    expect(entradaDeBase(manifiestoValido, 'falla')).toBeUndefined() // ok:false → no sirve para restaurar
    expect(entradaDeBase(manifiestoValido, 'inexistente')).toBeUndefined()
  })

  it('compararCenso detecta faltantes', () => {
    const esperado = { Paciente: 6548, Cita: 139 }
    expect(compararCenso(esperado, { Paciente: 6548, Cita: 139 }).ok).toBe(true)
    const diff = compararCenso(esperado, { Paciente: 6548, Cita: 138 })
    expect(diff.ok).toBe(false)
    expect(diff.filas.find((f) => f.tabla === 'Cita')).toMatchObject({ esperado: 139, obtenido: 138, ok: false })
  })
})
