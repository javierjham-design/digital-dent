import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { getAutomatizaciones, putAutomatizaciones, reemitirCitasProximas } from '@/services/automatizaciones.service'
import { guardarTemplates, marcarNotificadoWhatsapp } from '@/services/tubot-agenda.service'
import { reenviarConfirmacionPorBot } from '@/services/citas.service'

// Gestor de IA (clínica): maestro + flujos (confirmaciones / recaptura no-show / tratamiento) +
// tiempos de detección. El maestro no se puede encender sin TuBot conectado.
let A: TenantFixture

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
})

describe('gestor de IA / automatizaciones', () => {
  it('get devuelve defaults', async () => {
    const db = tenantClient(A.dbName)
    const base = await getAutomatizaciones(db)
    expect(base.maestroActivo).toBe(false)
    expect(base.confirmaciones).toMatchObject({ activo: true, hora1: '12:00', segundaActiva: true, hora2: '18:00' })
    expect(base.noShow).toMatchObject({ activo: false, horasAuto: 3, diasPerdido: 5 })
    expect(base.tratamiento).toMatchObject({ activo: false, diasEspera: 3 })
  })

  it('no deja encender el maestro si TuBot no está conectado', async () => {
    const db = tenantClient(A.dbName)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: false } })
    await expect(putAutomatizaciones(db, { maestroActivo: true })).rejects.toThrow(/TuBot/)
  })

  it('con TuBot conectado persiste maestro + flujos + tiempos', async () => {
    const db = tenantClient(A.dbName)
    await control.clinica.update({ where: { id: A.clinicaId }, data: { waEnabled: true } }).catch(() => {})
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: true, agendaWhConnectionId: 'conn_x' } })
    const upd = await putAutomatizaciones(db, {
      maestroActivo: true, confirmacionesActivo: false, noShowActivo: true, tratamientoActivo: true,
      hora1: '11:00', segundaActiva: true, hora2: '17:30',
      noShowHorasAuto: 2, perdidoDias: 7, tratamientoDiasEspera: 4,
    })
    expect(upd.maestroActivo).toBe(true)
    expect(upd.confirmaciones).toMatchObject({ activo: false, hora1: '11:00', segundaActiva: true, hora2: '17:30' })
    expect(upd.noShow).toMatchObject({ activo: true, horasAuto: 2, diasPerdido: 7 })
    expect(upd.tratamiento).toMatchObject({ activo: true, diasEspera: 4 })
  })

  it('rechaza valores fuera de rango y horarios inválidos', async () => {
    const db = tenantClient(A.dbName)
    await expect(putAutomatizaciones(db, { noShowHorasAuto: 999 })).rejects.toThrow()
    await expect(putAutomatizaciones(db, { hora1: '25:00' })).rejects.toThrow(/HH:MM/)
    await expect(putAutomatizaciones(db, { hora1: '18:00', hora2: '12:00' })).rejects.toThrow(/posterior/)
  })

  it('selección de plantilla por flujo: solo acepta una de las sincronizadas', async () => {
    const db = tenantClient(A.dbName)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { tubotTemplates: JSON.stringify([{ name: 'recordatorio_cita', variables: 4 }, { name: 'recaptura_noshow', variables: 2 }]) } })
    const base = await getAutomatizaciones(db)
    expect(base.plantillasDisponibles.map((p) => p.name)).toContain('recordatorio_cita')
    const upd = await putAutomatizaciones(db, { plantillaRecordatorio: 'recordatorio_cita', plantillaNoShow: 'recaptura_noshow' })
    expect(upd.confirmaciones.plantilla).toBe('recordatorio_cita')
    expect(upd.noShow.plantilla).toBe('recaptura_noshow')
    await expect(putAutomatizaciones(db, { plantillaRecordatorio: 'no_existe' })).rejects.toThrow(/aprobadas/)
  })

  it('TuBot sincroniza plantillas: cachea solo las APPROVED y las deja disponibles', async () => {
    const db = tenantClient(A.dbName)
    const r = await guardarTemplates(db, [
      { name: 'recordatorio_cita', status: 'APPROVED', variables: 4 },
      { name: 'pendiente_x', status: 'PENDING' },
      { name: 'recaptura_tratamiento', status: 'APPROVED', variables: 2 },
    ])
    expect(r.guardadas).toBe(2)
    const { plantillasDisponibles } = await getAutomatizaciones(db)
    const nombres = plantillasDisponibles.map((p) => p.name)
    expect(nombres).toContain('recordatorio_cita')
    expect(nombres).toContain('recaptura_tratamiento')
    expect(nombres).not.toContain('pendiente_x')
  })

  it('backfill: exige maestro encendido y cuenta las citas futuras activas', async () => {
    const db = tenantClient(A.dbName)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { automatizacionesEnabled: false } })
    await expect(reemitirCitasProximas(db)).rejects.toThrow(/maestro/i)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: true, agendaWhConnectionId: 'conn_x', automatizacionesEnabled: true } })
    await db.cita.create({ data: { pacienteId: A.pacienteId, doctorId: A.adminId, fecha: new Date(Date.now() + 2 * 86400_000), estado: 'PENDIENTE' } })
    const r = await reemitirCitasProximas(db)
    expect(r.reemitidas).toBeGreaterThanOrEqual(1)
  })

  it('marcarNotificadoWhatsapp: Agendada → Notificado por WhatsApp + historial; no pisa estados superiores', async () => {
    const db = tenantClient(A.dbName)
    const c1 = await db.cita.create({ data: { pacienteId: A.pacienteId, doctorId: A.adminId, fecha: new Date(Date.now() + 3 * 86400_000), estado: 'PENDIENTE' } })
    const r1 = await marcarNotificadoWhatsapp(db, c1.id)
    expect(r1.estado).toBe('CONFIRMADA')
    expect(await db.citaLog.count({ where: { citaId: c1.id, tipo: 'WA_ENVIADO' } })).toBe(1)
    // No degrada un CONFIRMADO (confirmado por otro medio): queda igual, pero igual deja historial.
    const c2 = await db.cita.create({ data: { pacienteId: A.pacienteId, doctorId: A.adminId, fecha: new Date(Date.now() + 4 * 86400_000), estado: 'CONFIRMADO' } })
    const r2 = await marcarNotificadoWhatsapp(db, c2.id)
    expect(r2.estado).toBe('CONFIRMADO')
    expect(await db.citaLog.count({ where: { citaId: c2.id, tipo: 'WA_ENVIADO' } })).toBe(1)
  })

  it('reenviar por el bot: exige conexión + teléfono + estado no terminal; deja log y no falla', async () => {
    const db = tenantClient(A.dbName)
    await db.paciente.update({ where: { id: A.pacienteId }, data: { telefono: '+56990001111' } })
    const cita = await db.cita.create({ data: { pacienteId: A.pacienteId, doctorId: A.adminId, fecha: new Date(Date.now() + 2 * 86400_000), estado: 'PENDIENTE' } })
    // Sin conexión → rechaza con mensaje claro.
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: false, agendaWhConnectionId: null } })
    await expect(reenviarConfirmacionPorBot(db, cita.id, 'Recep')).rejects.toThrow(/no está conectado/i)
    // Con conexión → ok + log WA_REENVIO_BOT (funciona aunque el maestro esté apagado: force).
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: true, agendaWhConnectionId: 'conn_x', automatizacionesEnabled: false } })
    const r = await reenviarConfirmacionPorBot(db, cita.id, 'Recep')
    expect(r.ok).toBe(true)
    expect(await db.citaLog.count({ where: { citaId: cita.id, tipo: 'WA_REENVIO_BOT' } })).toBe(1)
    // Cita cancelada → rechaza (no se reenvía).
    const cancelada = await db.cita.create({ data: { pacienteId: A.pacienteId, doctorId: A.adminId, fecha: new Date(Date.now() + 2 * 86400_000), estado: 'CANCELADA' } })
    await expect(reenviarConfirmacionPorBot(db, cancelada.id, 'Recep')).rejects.toThrow(/cancelada/i)
  })
})
