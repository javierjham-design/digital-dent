// LRU con expiración por inactividad y disposición asíncrona de los valores
// desalojados. Genérico y sin dependencias, para poder testearlo aislado (lo usa
// el caché de PrismaClient por clínica en db/tenant.ts).
//
// El orden de un Map de JS es de inserción: al USAR una clave la reinsertamos, así
// queda al final (= más reciente); la PRIMERA clave del Map es la menos usada (LRU).

export interface AsyncLruOptions<V> {
  maxSize: number
  ttlMs: number // 0 = sin expiración por inactividad
  dispose: (value: V, key: string) => void | Promise<void>
  now?: () => number // inyectable para tests
}

interface Entry<V> { value: V; lastUsed: number }

export class AsyncLru<V> {
  private readonly map = new Map<string, Entry<V>>()
  private readonly maxSize: number
  private readonly ttlMs: number
  private readonly dispose: (value: V, key: string) => void | Promise<void>
  private readonly now: () => number

  constructor(opts: AsyncLruOptions<V>) {
    this.maxSize = Math.max(1, Math.floor(opts.maxSize))
    this.ttlMs = Math.max(0, opts.ttlMs)
    this.dispose = opts.dispose
    this.now = opts.now ?? Date.now
  }

  get size(): number { return this.map.size }
  has(key: string): boolean { return this.map.has(key) }
  keys(): string[] { return [...this.map.keys()] }

  // Devuelve el valor cacheado (creándolo con `factory` si no existe), refrescando
  // su marca de uso. La disposición de lo expirado/desalojado es best-effort en
  // segundo plano: NO bloquea a quien pide el valor (importante porque tenantClient
  // devuelve el PrismaClient de forma síncrona).
  getOrCreate(key: string, factory: () => V): V {
    this.sweepExpired()
    const existing = this.map.get(key)
    if (existing) {
      existing.lastUsed = this.now()
      this.map.delete(key)     // reinsertar = marcar como el más reciente
      this.map.set(key, existing)
      return existing.value
    }
    const value = factory()
    this.map.set(key, { value, lastUsed: this.now() })
    this.evictOverflow()
    return value
  }

  // Elimina explícitamente una clave y dispone su valor (await-able). Lo usa
  // disposeTenant() en provisión / restore / sync.
  async delete(key: string): Promise<void> {
    const entry = this.map.get(key)
    if (!entry) return
    this.map.delete(key)
    await this.disposeSafe(entry.value, key)
  }

  // Expulsa las entradas inactivas por más de ttlMs (disposición en segundo plano).
  sweepExpired(): void {
    if (this.ttlMs === 0) return
    const limite = this.now() - this.ttlMs
    for (const [key, entry] of this.map) {
      if (entry.lastUsed <= limite) {
        this.map.delete(key)
        void this.disposeSafe(entry.value, key)
      }
    }
  }

  // Desaloja los MENOS usados hasta respetar maxSize.
  private evictOverflow(): void {
    while (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      const entry = this.map.get(oldestKey)!
      this.map.delete(oldestKey)
      void this.disposeSafe(entry.value, oldestKey)
    }
  }

  private async disposeSafe(value: V, key: string): Promise<void> {
    try { await this.dispose(value, key) } catch { /* best-effort: no romper por un disconnect */ }
  }
}
