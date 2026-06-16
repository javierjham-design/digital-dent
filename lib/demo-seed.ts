import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getVertical, type VerticalId } from '@/lib/verticales'

// ─────────────────────────────────────────────────────────────────────────────
//  Seed de una clínica DEMO
// ─────────────────────────────────────────────────────────────────────────────
//
//  Puebla una clínica recién creada con datos ficticios verosímiles para que
//  el prospecto pruebe la plataforma con vida: profesionales, horarios,
//  pacientes con RUT chileno válido, citas de la semana actual en distintos
//  estados, prestaciones, planes de tratamiento y algunos cobros.
//
//  Todo queda scopeado por clinicaId, así que es un sandbox aislado.

const NOMBRES = [
  'Javiera', 'Matías', 'Antonia', 'Benjamín', 'Florencia', 'Vicente', 'Isidora',
  'Agustín', 'Catalina', 'Tomás', 'Martina', 'Cristóbal', 'Valentina', 'Joaquín',
  'Emilia', 'Maximiliano', 'Josefa', 'Diego', 'Trinidad', 'Lucas', 'Camila', 'Sebastián',
]
const APELLIDOS = [
  'González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva',
  'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández',
  'Torres', 'Araya', 'Flores', 'Espinoza', 'Castillo', 'Tapia', 'Vásquez',
]
const PREVISIONES = ['Fonasa B', 'Fonasa C', 'Fonasa D', 'Isapre', 'Particular']
const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'EN_ESPERA', 'ATENDIDA', 'PENDIENTE', 'CONFIRMADA']

function calcularDV(rutNum: number): string {
  let suma = 0
  let mul = 2
  let n = rutNum
  while (n > 0) {
    suma += (n % 10) * mul
    n = Math.floor(n / 10)
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (suma % 11)
  if (res === 11) return '0'
  if (res === 10) return 'K'
  return String(res)
}

function rutChileno(): string {
  const num = 7_000_000 + Math.floor(Math.random() * 13_000_000)
  return `${num}-${calcularDV(num)}`
}

function fono(): string {
  return `+569${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Lunes de la semana actual a las 00:00.
function lunesDeEstaSemana(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=Dom
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

export async function seedDemoClinica(clinicaId: string, vertical: VerticalId = 'dental'): Promise<void> {
  const cfg = getVertical(vertical).seed
  const MOTIVOS = cfg.motivos
  const passHash = await bcrypt.hash('demo-doctor-' + Math.random().toString(36).slice(2), 10)

  // ── Profesionales (según rubro) ──────────────────────────────────────────
  const docsData = cfg.profesionales
  const doctores = []
  for (let i = 0; i < docsData.length; i++) {
    const u = await prisma.user.create({
      data: {
        clinicaId,
        name: docsData[i].name,
        username: `doctor${i + 1}`,
        email: null,
        password: passHash,
        role: 'doctor',
        especialidad: docsData[i].especialidad,
        activo: true,
        passwordChangedAt: new Date(),
        puedeRecibirPagos: true,
      },
    })
    doctores.push(u)
  }

  // ── Horarios (Lun-Vie 09:00-18:00, receso 13:00-14:00) ───────────────────
  for (const doc of doctores) {
    for (let dia = 1; dia <= 5; dia++) {
      await prisma.horarioDoctor.create({
        data: {
          clinicaId, doctorId: doc.id, diaSemana: dia,
          horaInicio: '09:00', horaFin: '18:00', activo: true,
          recesoActivo: true, recesoInicio: '13:00', recesoFin: '14:00',
        },
      })
    }
  }

  // ── Medios de pago ───────────────────────────────────────────────────────
  const mediosData = [
    { nombre: 'Efectivo', comision: 0 },
    { nombre: 'Débito', comision: 1.5 },
    { nombre: 'Crédito', comision: 2.95 },
    { nombre: 'Transferencia', comision: 0 },
  ]
  const medios = []
  for (const m of mediosData) {
    medios.push(await prisma.medioPago.create({ data: { clinicaId, ...m, activo: true } }))
  }

  // ── Prestaciones (según rubro) ───────────────────────────────────────────
  const prestaciones = []
  for (const p of cfg.prestaciones) {
    prestaciones.push(await prisma.prestacion.create({ data: { clinicaId, ...p, activo: true } }))
  }

  // ── Pacientes + ficha clínica ────────────────────────────────────────────
  const pacientes = []
  for (let i = 0; i < 18; i++) {
    const nombre = pick(NOMBRES)
    const apellido = `${pick(APELLIDOS)} ${pick(APELLIDOS)}`
    const edad = 8 + Math.floor(Math.random() * 60)
    const nac = new Date()
    nac.setFullYear(nac.getFullYear() - edad)
    const p = await prisma.paciente.create({
      data: {
        clinicaId,
        numero: i + 1,
        rut: rutChileno(),
        nombre,
        apellido,
        fechaNacimiento: nac,
        telefono: fono(),
        email: `${nombre.toLowerCase()}.${i}@ejemplo.cl`,
        prevision: pick(PREVISIONES),
        ciudad: 'Temuco',
        activo: true,
        fichaClinica: {
          create: {
            clinicaId,
            fumador: Math.random() < 0.2,
            diabetico: Math.random() < 0.12,
            hipertenso: Math.random() < 0.15,
            alertasMedicas: Math.random() < 0.15 ? 'Alergia a penicilina' : null,
          },
        },
      },
      include: { fichaClinica: true },
    })
    pacientes.push(p)
  }

  // ── Citas de la semana actual (Lun-Vie, varias por día y profesional) ─────
  const lunes = lunesDeEstaSemana()
  const horas = [9, 9.5, 10, 10.5, 11, 11.5, 12, 14, 14.5, 15, 15.5, 16, 16.5, 17]
  let citasCreadas = 0
  for (let dia = 0; dia < 5; dia++) {
    const fechaDia = new Date(lunes)
    fechaDia.setDate(lunes.getDate() + dia)
    // 5-7 citas por día repartidas entre profesionales
    const nCitas = 5 + Math.floor(Math.random() * 3)
    const horasDia = [...horas].sort(() => Math.random() - 0.5).slice(0, nCitas)
    for (const h of horasDia) {
      const doc = pick(doctores)
      const pac = pick(pacientes)
      const fecha = new Date(fechaDia)
      fecha.setHours(Math.floor(h), (h % 1) * 60, 0, 0)
      // Días pasados de la semana → atendidas/confirmadas; futuros → pendientes
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
      let estado: string
      if (fechaDia < hoy) estado = Math.random() < 0.8 ? 'ATENDIDA' : 'NO_ASISTIO'
      else if (fechaDia.getTime() === hoy.getTime()) estado = pick(['CONFIRMADA', 'EN_ESPERA', 'ATENDIDA', 'PENDIENTE'])
      else estado = pick(ESTADOS)
      await prisma.cita.create({
        data: {
          clinicaId,
          pacienteId: pac.id,
          doctorId: doc.id,
          fecha,
          duracion: 30,
          estado,
          tipo: pick(MOTIVOS),
          confirmadoWA: estado === 'CONFIRMADA' && Math.random() < 0.5,
          logs: { create: { tipo: 'AGENDADA', detalle: 'Cita agendada (demo)', userName: 'Recepción' } },
        },
      })
      citasCreadas++
    }
  }

  // ── Planes de tratamiento + cobros para algunos pacientes ─────────────────
  for (let i = 0; i < 6; i++) {
    const pac = pacientes[i]
    const ficha = pac.fichaClinica
    if (!ficha) continue
    const doc = pick(doctores)
    const plan = await prisma.planTratamiento.create({
      data: {
        clinicaId, pacienteId: pac.id, doctorTitularId: doc.id,
        nombre: 'Plan de tratamiento', estado: 'ACTIVO', fechaInicio: new Date(),
      },
    })
    const nItems = 2 + Math.floor(Math.random() * 3)
    for (let j = 0; j < nItems; j++) {
      const prest = pick(prestaciones)
      const completado = Math.random() < 0.5
      await prisma.tratamiento.create({
        data: {
          clinicaId, fichaId: ficha.id, planId: plan.id, prestacionId: prest.id,
          doctorId: doc.id, diente: 11 + Math.floor(Math.random() * 27),
          estado: completado ? 'COMPLETADO' : 'PLANIFICADO',
          precio: prest.precio,
          fechaCompletado: completado ? new Date() : null,
        },
      })
    }
  }

  // ── Cobros pagados (para que Reportes/Caja muestren ingresos) ─────────────
  let numCobro = 1
  for (let i = 0; i < 8; i++) {
    const pac = pick(pacientes)
    const prest = pick(prestaciones)
    const medio = pick(medios)
    const fechaPago = new Date(lunes)
    fechaPago.setDate(lunes.getDate() + Math.floor(Math.random() * 5))
    fechaPago.setHours(10 + Math.floor(Math.random() * 7), 0, 0, 0)
    const comisionMonto = Math.round(prest.precio * (medio.comision / 100))
    await prisma.cobro.create({
      data: {
        clinicaId, pacienteId: pac.id, numero: numCobro++,
        concepto: prest.nombre, monto: prest.precio,
        montoNeto: prest.precio - comisionMonto, comisionMonto,
        estado: 'PAGADO', medioPagoId: medio.id, fechaPago,
      },
    })
  }
}
