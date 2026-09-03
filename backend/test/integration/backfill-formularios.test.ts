import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

// El token de la página NO puede leer el objeto formulario (nombre/#100), pero SÍ el
// `form_id` de cada lead (`/{leadgen_id}?fields=form_id`). El backfill pobla
// formularioId + campana = form_id, para distinguir/renombrar/filtrar por formulario.
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

describe('backfillFormularios (form_id → campana)', () => {
  it('pobla formularioId + campana=form_id desde el leadgen', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.createMany({ data: [
      { nombre: 'A', origen: 'META_FORM', leadgenId: 'lgA' },
      { nombre: 'B', origen: 'META_FORM', leadgenId: 'lgB' },
      { nombre: 'C', origen: 'META_FORM', leadgenId: 'lgC' }, // sin form_id (expirado >90d) → sin resolver
    ] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('lgA') && url.includes('fields=form_id')) return jsonResp({ id: 'lgA', form_id: '1429532345698706' })
      if (url.includes('lgB') && url.includes('fields=form_id')) return jsonResp({ id: 'lgB', form_id: '1429532345698706' })
      if (url.includes('lgC') && url.includes('fields=form_id')) return jsonResp({ id: 'lgC' }) // sin form_id
      return jsonResp({ data: [] })
    })
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, {})
    expect(r.resueltos).toBe(2)
    expect(r.sinResolver).toBe(1)
    expect(r.porFormulario.find((f) => f.formId === '1429532345698706')?.count).toBe(2)

    const a = await db.lead.findFirst({ where: { leadgenId: 'lgA' }, select: { formularioId: true, campana: true } })
    expect(a?.formularioId).toBe('1429532345698706'); expect(a?.campana).toBe('1429532345698706')
    const c = await db.lead.findFirst({ where: { leadgenId: 'lgC' }, select: { campana: true } })
    expect(c?.campana).toBeNull()
  })

  it('si el lead ya tiene formularioId, usa ese como campana SIN llamar a Graph', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.create({ data: { nombre: 'Web', origen: 'META_FORM', leadgenId: 'lgWeb', formularioId: '915928751133277' } })
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResp({ error: { code: 4 } }, 403)) // si llamara, fallaría
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    await backfillFormularios(db, {})
    const l = await db.lead.findFirst({ where: { leadgenId: 'lgWeb' }, select: { campana: true } })
    expect(l?.campana).toBe('915928751133277')
    // no debió consultar Graph para este lead (ya tenía form_id)
    expect(spy.mock.calls.some((c) => String(c[0]).includes('lgWeb'))).toBe(false)
  })

  it('marca rateLimited cuando Graph responde #4', async () => {
    const db = tenantClient(A.dbName)
    await db.lead.create({ data: { nombre: 'RL', origen: 'META_FORM', leadgenId: 'lgRL' } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResp({ error: { message: 'Application request limit reached', code: 4 } }, 403))
    const { backfillFormularios } = await import('@/services/meta-leadads.service')
    const r = await backfillFormularios(db, {})
    expect(r.rateLimited).toBe(true)
    const l = await db.lead.findFirst({ where: { leadgenId: 'lgRL' }, select: { campana: true } })
    expect(l?.campana).toBeNull()
  })
})
