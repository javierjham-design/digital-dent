import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { crearUsuario } from '@/services/usuarios.service'
import type { JwtPayload } from '@/services/auth.service'

// Seguridad#1: un gestor de equipo (no admin) NO puede crear un usuario con rol admin
// (evita la auto-escalada a administrador por POST /usuarios).
let dbName = ''
beforeAll(async () => { const s = await seedDosClinicas(); dbName = s.A.dbName })

const actor = (role: string) => ({ sub: 'x', role } as unknown as JwtPayload)
const base = (username: string, role: string) => ({ name: 'Nuevo', username, password: 'Clave1234', role })

describe('crearUsuario: gating de rol admin', () => {
  it('rechaza que un no-admin cree un admin', async () => {
    const db = tenantClient(dbName)
    await expect(crearUsuario(db, actor('staff'), base('escalada', 'admin'))).rejects.toThrow(/administrador/i)
  })

  it('permite que un admin cree un admin', async () => {
    const db = tenantClient(dbName)
    const u = await crearUsuario(db, actor('admin'), base('jefa', 'admin'))
    expect(u.role).toBe('admin')
  })

  it('permite que un gestor cree un usuario no-admin', async () => {
    const db = tenantClient(dbName)
    const u = await crearUsuario(db, actor('staff'), base('recep1', 'staff'))
    expect(u.role).toBe('staff')
  })
})
