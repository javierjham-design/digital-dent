import { AsyncLocalStorage } from 'node:async_hooks'

// Contexto por request propagado con AsyncLocalStorage: permite que el logger (y
// Sentry) incluyan el request-id y la clínica en CADA log sin tener que pasar el
// `req` por todas las capas de services. Se siembra en el middleware requestContext
// (request-id) y se completa en requireAuth (userId) y requireTenant (slug).
export interface RequestContext {
  requestId: string
  slug?: string
  userId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

// Corre `fn` con un contexto de request activo. Todo lo que se ejecute dentro
// (incluidos los awaits que nacen aquí) verá este contexto vía getRequestContext().
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

// Completa el contexto actual (mutación in-place del objeto del store, así los
// campos añadidos más tarde —slug, userId— se ven en el resto del request).
export function patchRequestContext(patch: Partial<RequestContext>): void {
  const cur = storage.getStore()
  if (cur) Object.assign(cur, patch)
}
