import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

// Backfill del nombre del formulario por REVERSE-LOOKUP: lista de formularios de la
// página → leads de cada formulario → match por leadgen_id. Se mockea Graph (fetch).
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-enc-key-meta-formularios-1234567'

let A: TenantFixture

beforeAll(async () => {
  A = (await seedDosClinicas()).A
  const { encryptNullable } = await import('@/lib/crypto')
  const db = tenantClient(A.dbName)
  await db.configuracion.update({ where: { id: 'singleton' }, data: { metaLeadAdsEnabled: true, metaPageId: 'PAGE1', metaPageAccessToken: encryptNullable('tok-123') } })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) as any

afterEach(() => vi.restoreAllMocks())

describe('backfillFormularios (reverse-lookup)', () => {
  it('mapea cada lead a su formulario por leadgen_id y guarda el nombre', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.createMany({ data: [
      { nombre: 'Uno', origen: 'META_FORM', leadgenId: 'lg1' },
      { nombre: 'Dos', origen: 'META_FORM', leadgenId: 'lg2' },
      { nombre: 'Tres', origen: 'META_FORM', leadgenId: 'lg3' },
      { nombre: 'Cuatro', origen: 'META_FORM', leadgenId: 'lg4' }, // no está en ningún form → sin resolver
    ] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('/PAGE1/leadgen_forms')) return jsonResp({ data: [{ id: 'F1', name: 'Campaña Implantes' }, { id: 'F2', name: 'Campaña Ortodoncia' }] })
      if (url.includes('/F1/leads')) return jsonResp({ data: [{ id: 'lg1' }, { id: 'lg2' }, { id: 'lgX' }] })
      if (url.includes('/F2/leads')) return jsonResp({ data: [{ id: 'lg3' }] })
      return jsonResp({ data: [] })
    })

    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, {})
    expect(r.resueltos).toBe(3)
    expect(r.sinResolver).toBe(1)
    expect(r.formularios).toBe(2)
    expect(r.rateLimited).toBe(false)
    const f1 = r.porFormulario.find((f) => f.formId === 'F1')
    expect(f1?.nombre).toBe('Campaña Implantes'); expect(f1?.count).toBe(2)

    const l1 = await db.lead.findFirst({ where: { leadgenId: 'lg1' }, select: { formularioNombre: true, formularioId: true } })
    expect(l1?.formularioNombre).toBe('Campaña Implantes'); expect(l1?.formularioId).toBe('F1')
    const l3 = await db.lead.findFirst({ where: { leadgenId: 'lg3' }, select: { formularioNombre: true } })
    expect(l3?.formularioNombre).toBe('Campaña Ortodoncia')
    const l4 = await db.lead.findFirst({ where: { leadgenId: 'lg4' }, select: { formularioNombre: true } })
    expect(l4?.formularioNombre).toBeNull()
  })

  it('sigue la paginación de los leads del formulario', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.create({ data: { nombre: 'Pag', origen: 'META_FORM', leadgenId: 'lgpag' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('/PAGE1/leadgen_forms')) return jsonResp({ data: [{ id: 'FP', name: 'Campaña Paginada' }] })
      if (url.includes('/FP/leads') && !url.includes('after=P2')) return jsonResp({ data: [{ id: 'zzz' }], paging: { next: 'https://graph/FP/leads?after=P2' } })
      if (url.includes('after=P2')) return jsonResp({ data: [{ id: 'lgpag' }] }) // 2ª página trae el nuestro
      return jsonResp({ data: [] })
    })
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, {})
    const l = await db.lead.findFirst({ where: { leadgenId: 'lgpag' }, select: { formularioNombre: true } })
    expect(l?.formularioNombre).toBe('Campaña Paginada')
    expect(r.resueltos).toBeGreaterThanOrEqual(1)
  })

  it('dry no escribe pero cuenta', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.create({ data: { nombre: 'Dry', origen: 'META_FORM', leadgenId: 'lgdry' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('/PAGE1/leadgen_forms')) return jsonResp({ data: [{ id: 'FD', name: 'Campaña Dry' }] })
      if (url.includes('/FD/leads')) return jsonResp({ data: [{ id: 'lgdry' }] })
      return jsonResp({ data: [] })
    })
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, { dry: true })
    expect(r.dry).toBe(true)
    expect(r.porFormulario.some((f) => f.formId === 'FD')).toBe(true)
    const l = await db.lead.findFirst({ where: { leadgenId: 'lgdry' }, select: { formularioNombre: true } })
    expect(l?.formularioNombre).toBeNull() // dry no escribió
  })

  it('fallback por-lead cuando no se pueden listar formularios (#200)', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.create({ data: { nombre: 'PL', origen: 'META_FORM', leadgenId: 'lgpl' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('/leadgen_forms')) return jsonResp({ error: { message: 'Requires pages_manage_ads permission', code: 200 } }, 403)
      if (url.includes('lgpl') && url.includes('fields=form_id')) return jsonResp({ id: 'lgpl', form_id: 'FPL' }) // descubrir form_id (muestra)
      if (url.includes('/FPL') && url.includes('fields=name')) return jsonResp({ name: 'Campaña PorLead' })           // nombre del form
      if (url.includes('/FPL/leads')) return jsonResp({ data: [{ id: 'lgpl' }] })                                    // reverse-lookup
      if (url.includes('fields=form_id')) return jsonResp({ id: 'x' }) // otros leads de la muestra: sin form_id
      return jsonResp({ data: [] })
    })
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, { dias: 3650 })
    expect(r.via).toBe('per-lead')
    const l = await db.lead.findFirst({ where: { leadgenId: 'lgpl' }, select: { formularioNombre: true, formularioId: true } })
    expect(l?.formularioNombre).toBe('Campaña PorLead'); expect(l?.formularioId).toBe('FPL')
  })

  it('marca rateLimited cuando Graph responde #4', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.create({ data: { nombre: 'RL', origen: 'META_FORM', leadgenId: 'lgrl' } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResp({ error: { message: 'Application request limit reached', code: 4 } }, 403))
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, {})
    expect(r.rateLimited).toBe(true)
    expect(r.resueltos).toBe(0)
    const l = await db.lead.findFirst({ where: { leadgenId: 'lgrl' }, select: { formularioNombre: true } })
    expect(l?.formularioNombre).toBeNull()
  })
})
