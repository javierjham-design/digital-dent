import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { crearPlantilla, previsualizar } from '@/services/consentimientos.service'
import type { JwtPayload } from '@/services/auth.service'

// Regresión: la fecha de nacimiento es "fecha-sola" (se guarda como medianoche UTC). En el
// consentimiento debe renderizarse TAL CUAL la registrada, sin retroceder un día por convertirla
// a la zona horaria de Chile (UTC-3/-4). Bug reportado: aparecía el día ANTERIOR.
let dbName = ''
beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.A.dbName
})

const actor = { sub: 'u1', role: 'admin' } as unknown as JwtPayload

describe('consentimientos: fecha de nacimiento sin desfase de zona horaria', () => {
  it('renderiza la fecha registrada, no el día anterior', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Naci', apellido: 'Do', activo: true, fechaNacimiento: new Date('1990-05-15') } })
    const plantilla = await crearPlantilla(db, { titulo: 'CI prueba', codigo: 'CIP', contenidoHtml: 'Nace el {{PACIENTE_FECHA_NACIMIENTO}}, edad {{PACIENTE_EDAD}}.' })
    const { html } = await previsualizar(db, actor, pac.id, plantilla.id, undefined)
    // Tolerante al separador (/ o -, según ICU del entorno). Lo clave: día 15, NO el 14.
    expect(html).toMatch(/15[/\-.]05[/\-.]1990/)
    expect(html).not.toMatch(/14[/\-.]05[/\-.]1990/)
  })
})
