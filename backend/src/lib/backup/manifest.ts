// Manifiesto de una corrida de backup: describe QUÉ se respaldó y permite verificar
// una restauración (sha256 del archivo cifrado + censo de filas por base). Se guarda
// como JSON en el bucket junto a los dumps. Validación con zod (ya es dependencia).
import { z } from 'zod'

const BaseEntrySchema = z.object({
  dbName: z.string(),
  slug: z.string(),
  esControl: z.boolean().optional(),
  esDemo: z.boolean().optional(),
  key: z.string().nullable(),        // ruta del dump.enc (null si falló)
  bytes: z.number().nonnegative(),
  sha256: z.string().nullable(),     // sha256 del archivo cifrado
  duracionMs: z.number().nonnegative(),
  censo: z.record(z.string(), z.number()),
  ok: z.boolean(),
  error: z.string().optional(),
})

const ManifestSchema = z.object({
  version: z.literal(1),
  iso: z.string(),                   // timestamp de la corrida (ISO8601)
  disparadoPor: z.string(),          // cron | manual | drill
  incluirDemos: z.boolean(),
  bases: z.array(BaseEntrySchema),
})

export type BaseEntry = z.infer<typeof BaseEntrySchema>
export type BackupManifest = z.infer<typeof ManifestSchema>

export function parseManifest(raw: unknown): BackupManifest {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
  return ManifestSchema.parse(obj)
}

// Igual que parseManifest pero devuelve null en vez de lanzar (para la poda, que
// debe negarse si un manifiesto no valida en vez de romper).
export function tryParseManifest(raw: unknown): BackupManifest | null {
  try { return parseManifest(raw) } catch { return null }
}

export function serializeManifest(m: BackupManifest): Buffer {
  return Buffer.from(JSON.stringify(m, null, 2), 'utf8')
}

// Busca la entrada OK de una base (por slug o dbName) dentro de un manifiesto.
export function entradaDeBase(m: BackupManifest, ref: string): BaseEntry | undefined {
  return m.bases.find((b) => (b.slug === ref || b.dbName === ref) && b.ok && b.key && b.sha256)
}
