export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PrintCobroClient } from './print-cobro-client'

export default async function PrintCobroPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')
  const { id } = await params

  const cobro = await prisma.cobro.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      paciente: true,
      medioPago: true,
      reciboUsuario: { select: { id: true, name: true, email: true } },
      items: true,
    },
  })
  if (!cobro) notFound()

  const clinica = await prisma.clinica.findUnique({
    where: { id: u.clinicaId },
    select: { nombre: true, direccion: true, ciudad: true, telefono: true, email: true, rut: true, logoUrl: true },
  })

  return (
    <PrintCobroClient
      clinica={clinica}
      cobro={{
        id:               cobro.id,
        numero:           cobro.numero,
        concepto:         cobro.concepto,
        monto:            cobro.monto,
        montoNeto:        cobro.montoNeto,
        comisionMonto:    cobro.comisionMonto,
        estado:           cobro.estado,
        anulado:          cobro.anulado,
        motivoAnulacion:  cobro.motivoAnulacion,
        anuladoAt:        cobro.anuladoAt?.toISOString() ?? null,
        anuladoPorNombre: cobro.anuladoPorNombre,
        fechaPago:        cobro.fechaPago?.toISOString() ?? null,
        createdAt:        cobro.createdAt.toISOString(),
        notas:            cobro.notas,
        paciente: {
          nombre:    cobro.paciente.nombre,
          apellido:  cobro.paciente.apellido,
          rut:       cobro.paciente.rut,
          telefono:  cobro.paciente.telefono,
          email:     cobro.paciente.email,
          direccion: cobro.paciente.direccion,
        },
        medioPago: cobro.medioPago ? { nombre: cobro.medioPago.nombre } : null,
        reciboUsuario: cobro.reciboUsuario ? { nombre: cobro.reciboUsuario.name ?? cobro.reciboUsuario.email } : null,
        items: cobro.items.map(i => ({ id: i.id, descripcion: i.descripcion, monto: i.monto })),
      }}
    />
  )
}
