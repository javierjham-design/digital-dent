// Cliente de CONTROL-PLANE de prueba (sqlite). El config de integración aliasa
// @/db/control → este módulo.
// @ts-expect-error — cliente generado en globalSetup
import { PrismaClient } from '../../prisma/control/.test-control-client/index.js'
import path from 'node:path'

const url = 'file:' + path.resolve('prisma/.test-control.db').replace(/\\/g, '/')
export const control = new PrismaClient({ datasources: { db: { url } } })
