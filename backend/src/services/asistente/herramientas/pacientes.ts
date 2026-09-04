import { z } from 'zod'
import { totalesDePlan } from '@/services/tratamientos.service'
import { normalizar } from '../seudonimo'
import { ErrorHerramienta, type Herramienta } from '../tipos'
import { edadEnAnios } from './comun'

// 1) buscar_paciente(texto): candidatos por nombre (insensible a acentos/mayúsculas),
// devueltos como token + edad, sexo y última visita. El texto ya viene
// seudonimizado; un nombre completo del usuario ya habría sido tokenizado, así que
// esto sirve para fragmentos (p.ej. solo el nombre) que el usuario escribió.
export const buscarPaciente: Herramienta<{ texto: string }> = {
  nombre: 'buscar_paciente',
  descripcion: 'Busca pacientes por nombre o apellido y devuelve edad, sexo y última visita. Úsalo cuando el usuario menciona a un paciente por un fragmento de su nombre y no como mención con token.',
  parametros: z.object({ texto: z.string().min(1).max(120) }),
  identidad: [{ columna: 'paciente', tipo: 'paciente' }],
  async ejecutar(ctx, { texto }) {
    const needle = normalizar(texto.trim())
    const todos = await ctx.db.paciente.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, apellido: true, fechaNacimiento: true, sexo: true },
    })
    const matches = todos.filter((p) => normalizar(`${p.nombre} ${p.apellido}`).includes(needle))
    const top = matches.slice(0, 25)
    // Última visita (cita REALIZADA más reciente) de los candidatos, en una consulta.
    const ultimas = new Map<string, Date>()
    if (top.length) {
      const citas = await ctx.db.cita.findMany({
        where: { pacienteId: { in: top.map((p) => p.id) }, estado: 'REALIZADA' },
        select: { pacienteId: true, fecha: true },
        orderBy: { fecha: 'desc' },
      })
      for (const c of citas) if (!ultimas.has(c.pacienteId)) ultimas.set(c.pacienteId, c.fecha)
    }
    return {
      columnas: [
        { clave: 'paciente', etiqueta: 'Paciente', tipo: 'paciente' },
        { clave: 'edad', etiqueta: 'Edad', tipo: 'entero' },
        { clave: 'sexo', etiqueta: 'Sexo', tipo: 'texto' },
        { clave: 'ultimaVisita', etiqueta: 'Última visita', tipo: 'fecha' },
      ],
      filas: top.map((p) => ({
        paciente: p.id,
        edad: edadEnAnios(p.fechaNacimiento),
        sexo: p.sexo ?? null,
        ultimaVisita: ultimas.get(p.id) ?? null,
      })),
      totalFilas: matches.length,
      resumen: { coincidencias: matches.length },
    }
  },
}

// 2) ficha_resumen(paciente): planes con estado/saldo, alertas y próximas/últimas
// citas de UN paciente ya identificado por token. Sin N+1: pocas consultas.
export const fichaResumen: Herramienta<{ paciente: string }> = {
  nombre: 'ficha_resumen',
  descripcion: 'Resumen de un paciente identificado por token: sus planes con estado y saldo, alertas (alergias/antecedentes), última visita y próxima cita.',
  parametros: z.object({ paciente: z.string().min(1) }),
  tokensParametro: [{ campo: 'paciente', tipo: 'paciente' }],
  identidad: [], // el paciente ya está identificado por el token de entrada
  async ejecutar(ctx, { paciente }) {
    const pac = await ctx.db.paciente.findUnique({
      where: { id: paciente },
      select: { fechaNacimiento: true, sexo: true, alergias: true, antecedentes: true },
    })
    if (!pac) throw new ErrorHerramienta('Paciente no encontrado.')
    const planes = await ctx.db.planTratamiento.findMany({
      where: { pacienteId: paciente },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, nombre: true, estado: true,
        tratamientos: { select: { estado: true, precio: true, descuento: true, cobroItems: { select: { monto: true, cobro: { select: { estado: true } } } } } },
      },
    })
    const abonos = planes.length
      ? await ctx.db.cobroItem.findMany({ where: { planId: { in: planes.map((p) => p.id) }, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } }, select: { planId: true, monto: true } })
      : []
    const abonoMap = new Map<string, number>()
    for (const it of abonos) if (it.planId) abonoMap.set(it.planId, (abonoMap.get(it.planId) ?? 0) + it.monto)

    const ahora = new Date()
    const [ultima, proxima] = await Promise.all([
      ctx.db.cita.findFirst({ where: { pacienteId: paciente, estado: 'REALIZADA' }, orderBy: { fecha: 'desc' }, select: { fecha: true } }),
      ctx.db.cita.findFirst({ where: { pacienteId: paciente, fecha: { gte: ahora }, estado: { notIn: ['CANCELADA'] } }, orderBy: { fecha: 'asc' }, select: { fecha: true } }),
    ])

    const filas = planes.map((p) => {
      const t = totalesDePlan(p.tratamientos, abonoMap.get(p.id) ?? 0)
      return { plan: p.nombre, estado: p.estado, total: t.total, abonado: t.abonado, saldo: t.saldo, ejecucion: t.tieneEjecucion ? 'Sí' : 'No' }
    })
    const alertas = [pac.alergias ? `Alergias: ${pac.alergias}` : '', pac.antecedentes ? `Antecedentes: ${pac.antecedentes}` : ''].filter(Boolean).join(' · ')
    return {
      columnas: [
        { clave: 'plan', etiqueta: 'Plan', tipo: 'texto' },
        { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' },
        { clave: 'total', etiqueta: 'Total', tipo: 'dinero' },
        { clave: 'abonado', etiqueta: 'Abonado', tipo: 'dinero' },
        { clave: 'saldo', etiqueta: 'Saldo', tipo: 'dinero' },
        { clave: 'ejecucion', etiqueta: 'Con ejecución', tipo: 'texto' },
      ],
      filas,
      totalFilas: filas.length,
      resumen: {
        edad: edadEnAnios(pac.fechaNacimiento) ?? 'n/d',
        sexo: pac.sexo ?? 'n/d',
        alertas: alertas || 'sin alertas registradas',
        ultimaVisita: ultima ? ultima.fecha.toISOString().slice(0, 10) : 'sin visitas',
        proximaCita: proxima ? proxima.fecha.toISOString().slice(0, 10) : 'sin próxima cita',
      },
    }
  },
}
