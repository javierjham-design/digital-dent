import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Deriva un schema SQLite a partir del schema real (Postgres) para tests de
// integración. El schema de Cláriva no usa features Postgres-only (sin @db.,
// sin arrays, sin Json, sin enums nativos), así que la única diferencia es el
// datasource y un output de cliente aparte para no pisar el cliente Postgres.
const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '../..') // backend/
const src = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')

const out = src
  .replace(/generator client \{[\s\S]*?\n\}/, 'generator client {\n  provider = "prisma-client-js"\n  output   = "./.test-client"\n}')
  .replace(/datasource db \{[\s\S]*?\n\}/, 'datasource db {\n  provider = "sqlite"\n  url      = "file:./test.db"\n}')

fs.writeFileSync(path.join(root, 'prisma/schema.test.prisma'), out)
console.log('[integration] prisma/schema.test.prisma generado (sqlite)')
