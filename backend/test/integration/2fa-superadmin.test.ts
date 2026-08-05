import { describe, it, expect, beforeAll } from 'vitest'
import { authenticator } from 'otplib'
import { seedDosClinicas, PASSWORD } from './seed'
import { login, setup2FA, verify2FA } from '@/services/auth.service'
import type { Login2FAChallenge, LoginResponse } from '@shared/types'

// Flujo completo del 2FA TOTP del super-admin (schema de CONTROL). El login por email
// NO devuelve sesión: devuelve un desafío; la sesión sale del segundo paso.
const EMAIL = 'super@clariva.cl'
const IP = '9.9.9.9'

const esDesafio = (r: unknown): r is Login2FAChallenge => !!r && typeof r === 'object' && 'requiere2FA' in r
const esSesion = (r: unknown): r is LoginResponse => !!r && typeof r === 'object' && 'token' in r

// Estado compartido entre los `it` secuenciales (el 2FA se da de alta una vez).
let secreto = ''
let backupCodes: string[] = []

beforeAll(async () => { await seedDosClinicas() })

describe('2FA TOTP del super-admin', () => {
  it('login por email NO emite sesión: devuelve un desafío (modo "alta" si aún no tiene 2FA)', async () => {
    const r = await login({ email: EMAIL, password: PASSWORD }, IP)
    expect(esDesafio(r)).toBe(true)
    expect((r as Login2FAChallenge).modo).toBe('alta')
    expect((r as Login2FAChallenge).desafio).toBeTruthy()
    expect(esSesion(r)).toBe(false)
  })

  it('alta: setup devuelve QR + secreto + 10 códigos de respaldo, y verify con el código habilita el 2FA y da sesión', async () => {
    const r = (await login({ email: EMAIL, password: PASSWORD }, IP)) as Login2FAChallenge
    const setup = await setup2FA(r.desafio)
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(setup.secret).toBeTruthy()
    expect(setup.backupCodes).toHaveLength(10)
    secreto = setup.secret
    backupCodes = setup.backupCodes

    const sesion = await verify2FA(r.desafio, authenticator.generate(secreto), IP)
    expect(esSesion(sesion)).toBe(true)
    expect(sesion.user.isPlatformAdmin).toBe(true)
    expect(sesion.token).toBeTruthy()
  })

  it('login con 2FA ya habilitado: desafío modo "codigo" y código TOTP válido → sesión', async () => {
    const r = (await login({ email: EMAIL, password: PASSWORD }, IP)) as Login2FAChallenge
    expect(r.modo).toBe('codigo')
    const sesion = await verify2FA(r.desafio, authenticator.generate(secreto), IP)
    expect(esSesion(sesion)).toBe(true)
  })

  it('código TOTP inválido → rechazado (no da sesión)', async () => {
    const r = (await login({ email: EMAIL, password: PASSWORD }, IP)) as Login2FAChallenge
    await expect(verify2FA(r.desafio, '000000', IP)).rejects.toThrow()
  })

  it('código de respaldo: sirve UNA vez y el reuso se rechaza', async () => {
    const codigo = backupCodes[0]

    const r1 = (await login({ email: EMAIL, password: PASSWORD }, IP)) as Login2FAChallenge
    const sesion = await verify2FA(r1.desafio, codigo, IP)
    expect(esSesion(sesion)).toBe(true) // primer uso: OK

    const r2 = (await login({ email: EMAIL, password: PASSWORD }, IP)) as Login2FAChallenge
    await expect(verify2FA(r2.desafio, codigo, IP)).rejects.toThrow() // reuso: rechazado
  })
})
