import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// GUARDA anti-desincronización. `prisma/tenant/init.sql` es el DDL que usa
// applyTenantSchema() (lib/provision.ts) para crear la base de una clínica NUEVA y de
// cada demo de la landing. Si alguien cambia `prisma/tenant/schema.prisma` y se olvida de
// correr `npm run tenant:initsql`, ese archivo queda atrás y las clínicas/demos nuevas
// nacen con columnas faltantes (el código que las lee falla hasta el próximo deploy).
//
// Este test regenera el DDL desde el schema y falla si difiere del init.sql commiteado.
// Si falla: correr `npm run tenant:initsql` y commitear el init.sql regenerado.

const norm = (s: string) => s.replace(/\r\n/g, '\n').trimEnd()

describe('init.sql sincronizado con el schema tenant', () => {
  it('coincide con `prisma migrate diff` del schema (si falla: `npm run tenant:initsql`)', () => {
    const regenerado = execSync(
      'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/tenant/schema.prisma --script',
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const commiteado = readFileSync(path.resolve(process.cwd(), 'prisma/tenant/init.sql'), 'utf8')
    expect(norm(regenerado)).toBe(norm(commiteado))
  }, 120_000)
})
