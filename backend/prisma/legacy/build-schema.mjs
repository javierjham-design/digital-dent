// Deriva un schema Prisma de SOLO LECTURA a partir del schema del monolito
// (prisma/schema.prisma en la raíz del repo) para que el script de migración de
// datos (F7, `npm run migrate:data`) pueda leer la base COMPARTIDA del monolito.
//
// No lo edites a mano: se regenera con `npm run prisma:generate:legacy`. Solo
// cambia el generator (output dedicado) y el datasource (LEGACY_DATABASE_URL),
// dejando los modelos idénticos a los del monolito.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '../../../prisma/schema.prisma') // schema del monolito (raíz)
const OUT = path.join(here, 'schema.prisma')

if (!fs.existsSync(SRC)) {
  console.error(`No se encontró el schema del monolito en ${SRC}`)
  process.exit(1)
}

let schema = fs.readFileSync(SRC, 'utf8')
schema = schema.replace(
  /generator\s+client\s*\{[\s\S]*?\}/,
  'generator client {\n  provider = "prisma-client-js"\n  output   = "../generated/legacy"\n}',
)
schema = schema.replace(
  /datasource\s+db\s*\{[\s\S]*?\}/,
  'datasource db {\n  provider = "postgresql"\n  url      = env("LEGACY_DATABASE_URL")\n}',
)
schema =
  '// ⚠️ DERIVADO de prisma/schema.prisma (monolito). NO editar a mano.\n' +
  '// Fuente de SOLO LECTURA para la migración de datos F7 (npm run migrate:data).\n' +
  '// Regenéralo con: npm run prisma:generate:legacy\n\n' +
  schema

fs.writeFileSync(OUT, schema)
console.log('legacy schema derivado →', path.relative(process.cwd(), OUT))
