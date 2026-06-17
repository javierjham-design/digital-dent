import { prisma } from '@/lib/prisma'

// Borra por completo una clínica demo y todos sus datos. El registro de Lead
// NO se borra: se le quita el vínculo a la clínica (clinicaId = null) para
// conservar el dato comercial aunque la demo desaparezca.
//
// El orden respeta las claves foráneas (hijos → padres). Las tablas de detalle
// sin clinicaId se borran por los ids de su padre.
export async function borrarClinicaDemo(clinicaId: string): Promise<void> {
  const [pacientes, citas, cobros, presupuestos, planes, fichas, liquidaciones, cajas, users] =
    await Promise.all([
      prisma.paciente.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.cita.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.cobro.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.presupuesto.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.planTratamiento.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.fichaClinica.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.liquidacion.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.caja.findMany({ where: { clinicaId }, select: { id: true } }),
      prisma.user.findMany({ where: { clinicaId }, select: { id: true } }),
    ])

  const ids = (arr: { id: string }[]) => arr.map((x) => x.id)

  await prisma.$transaction([
    // Detalle (sin clinicaId): por id de padre
    prisma.liquidacionItem.deleteMany({ where: { liquidacionId: { in: ids(liquidaciones) } } }),
    prisma.cobroItem.deleteMany({ where: { cobroId: { in: ids(cobros) } } }),
    prisma.itemPresupuesto.deleteMany({ where: { presupuestoId: { in: ids(presupuestos) } } }),
    prisma.citaLog.deleteMany({ where: { citaId: { in: ids(citas) } } }),
    prisma.diente.deleteMany({ where: { fichaId: { in: ids(fichas) } } }),
    prisma.cajaUsuario.deleteMany({ where: { cajaId: { in: ids(cajas) } } }),
    prisma.session.deleteMany({ where: { userId: { in: ids(users) } } }),
    prisma.seccionPlan.deleteMany({ where: { planId: { in: ids(planes) } } }),
    // Scopeadas por clinicaId
    prisma.movimientoCaja.deleteMany({ where: { clinicaId } }),
    prisma.evolucion.deleteMany({ where: { clinicaId } }),
    prisma.tratamiento.deleteMany({ where: { clinicaId } }),
    prisma.planTratamiento.deleteMany({ where: { clinicaId } }),
    prisma.presupuesto.deleteMany({ where: { clinicaId } }),
    prisma.cobro.deleteMany({ where: { clinicaId } }),
    prisma.sesionCaja.deleteMany({ where: { clinicaId } }),
    prisma.caja.deleteMany({ where: { clinicaId } }),
    prisma.medioPago.deleteMany({ where: { clinicaId } }),
    prisma.bloqueoAgenda.deleteMany({ where: { clinicaId } }),
    prisma.cita.deleteMany({ where: { clinicaId } }),
    prisma.mensajePaciente.deleteMany({ where: { clinicaId } }),
    prisma.comentarioAdministrativo.deleteMany({ where: { clinicaId } }),
    prisma.contrato.deleteMany({ where: { clinicaId } }),
    prisma.liquidacion.deleteMany({ where: { clinicaId } }),
    prisma.fichaClinica.deleteMany({ where: { clinicaId } }),
    prisma.prestacion.deleteMany({ where: { clinicaId } }),
    prisma.horarioDoctor.deleteMany({ where: { clinicaId } }),
    prisma.paciente.deleteMany({ where: { clinicaId } }),
    prisma.extraSuscripcion.deleteMany({ where: { clinicaId } }),
    prisma.pagoSuscripcion.deleteMany({ where: { clinicaId } }),
    prisma.user.deleteMany({ where: { clinicaId } }),
    // El lead sobrevive, sin vínculo a la clínica borrada.
    prisma.lead.updateMany({ where: { clinicaId }, data: { clinicaId: null } }),
    prisma.clinica.delete({ where: { id: clinicaId } }),
  ])

  // Evitar warning de variable sin uso: pacientes se materializó por simetría.
  void pacientes
}
