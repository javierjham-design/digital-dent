import { describe, it, expect, vi } from 'vitest'
import { AsyncLru } from '@/lib/lru'

// El LRU respalda el caché de PrismaClient por clínica (db/tenant.ts): tope de
// tamaño con desalojo del menos usado (→ $disconnect) + expiración por inactividad.

describe('AsyncLru', () => {
  it('desaloja el MENOS usado al superar maxSize y lo dispone', () => {
    const disposed: string[] = []
    const lru = new AsyncLru<string>({ maxSize: 2, ttlMs: 0, dispose: (_v, k) => { disposed.push(k) } })

    lru.getOrCreate('a', () => 'A')
    lru.getOrCreate('b', () => 'B')
    lru.getOrCreate('a', () => 'A2') // usar 'a' lo vuelve el más reciente → 'b' queda LRU
    lru.getOrCreate('c', () => 'C') // size 3 > max 2 → desaloja 'b'

    expect(disposed).toEqual(['b'])
    expect(lru.has('a')).toBe(true)
    expect(lru.has('b')).toBe(false)
    expect(lru.has('c')).toBe(true)
    expect(lru.size).toBe(2)
  })

  it('dispone exactamente el valor desalojado (simula $disconnect)', () => {
    const dispose = vi.fn()
    const lru = new AsyncLru<{ id: string }>({ maxSize: 1, ttlMs: 0, dispose })
    const a = { id: 'a' }
    const b = { id: 'b' }

    lru.getOrCreate('a', () => a)
    lru.getOrCreate('b', () => b) // desaloja 'a'

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith(a, 'a')
  })

  it('respeta el TTL: expira por inactividad y crea uno nuevo', () => {
    let t = 1000
    const disposed: string[] = []
    const lru = new AsyncLru<string>({ maxSize: 10, ttlMs: 100, now: () => t, dispose: (_v, k) => { disposed.push(k) } })

    lru.getOrCreate('a', () => 'A')

    t = 1050 // 50 ms después: dentro del TTL → mismo valor, refresca el uso
    expect(lru.getOrCreate('a', () => 'NO-DEBERIA')).toBe('A')
    expect(disposed).toEqual([])

    t = 1200 // 150 ms desde el último uso (1050) > TTL 100 → expira
    expect(lru.getOrCreate('a', () => 'A3')).toBe('A3')
    expect(disposed).toContain('a')
  })

  it('sweepExpired() cierra los inactivos sin necesidad de un nuevo acceso a esa clave', () => {
    let t = 0
    const disposed: string[] = []
    const lru = new AsyncLru<string>({ maxSize: 10, ttlMs: 100, now: () => t, dispose: (_v, k) => { disposed.push(k) } })
    lru.getOrCreate('a', () => 'A')
    lru.getOrCreate('b', () => 'B')

    t = 250
    lru.sweepExpired()

    expect(disposed.sort()).toEqual(['a', 'b'])
    expect(lru.size).toBe(0)
  })

  it('reusar una clave existente NO vuelve a crear ni dispone', () => {
    const dispose = vi.fn()
    const factory = vi.fn(() => 'A')
    const lru = new AsyncLru<string>({ maxSize: 5, ttlMs: 0, dispose })

    lru.getOrCreate('a', factory)
    lru.getOrCreate('a', factory)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('delete() dispone y quita la clave (semántica de disposeTenant)', async () => {
    const dispose = vi.fn()
    const lru = new AsyncLru<string>({ maxSize: 5, ttlMs: 0, dispose })
    lru.getOrCreate('a', () => 'A')

    await lru.delete('a')

    expect(dispose).toHaveBeenCalledWith('A', 'a')
    expect(lru.has('a')).toBe(false)
  })
})
