export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/auth'
import { MiCuentaClient } from './mi-cuenta-client'

export default async function MiCuentaPage() {
  const u = await getSessionUser()
  if (!u?.isPlatformAdmin) return null

  return (
    <MiCuentaClient
      email={u.email ?? ''}
      name={u.name ?? ''}
    />
  )
}
