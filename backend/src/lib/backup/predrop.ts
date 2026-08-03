// ¿Existe un dump lógico reciente con prefijo pre-drop/ para esta base? Es el
// requisito que exige dropTenantDatabase() antes de borrar una base PRODUCTIVA:
// nunca se borra algo irreversible sin una copia fresca fuera de Railway.
import { listObjects } from '@/lib/backup/storage'
import { env } from '@/config/env'

export async function hayPreDropReciente(dbName: string, dentroDeHoras = 24): Promise<boolean> {
  const objs = await listObjects(`${env.backup.s3Prefix}/pre-drop/`)
  const corte = Date.now() - dentroDeHoras * 3_600_000
  return objs.some((o) => o.key.includes(`/${dbName}__`) && o.lastModified.getTime() >= corte)
}
