import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Deriva schemas SQLITE de control y tenant (para tests de aislamiento físico).
// Cada uno con su propio cliente generado y datasource sqlite (url por env).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') // backend/

function derive(srcRel, output, urlEnv) {
  const src = fs.readFileSync(path.join(root, srcRel), 'utf8')
  const out = src
    .replace(/generator client \{[\s\S]*?\n\}/, `generator client {\n  provider = "prisma-client-js"\n  output   = "${output}"\n}`)
    .replace(/datasource db \{[\s\S]*?\n\}/, `datasource db {\n  provider = "sqlite"\n  url      = env("${urlEnv}")\n}`)
  fs.writeFileSync(path.join(root, srcRel.replace('schema.prisma', 'schema.test.prisma')), out)
}

derive('prisma/control/schema.prisma', './.test-control-client', 'CONTROL_DATABASE_URL')
derive('prisma/tenant/schema.prisma', './.test-tenant-client', 'TENANT_DATABASE_URL')
console.log('[integration] schemas sqlite derivados (control + tenant)')
