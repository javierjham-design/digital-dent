// Verticales / rubros de venta (copy de la landing por rubro). Portado del
// monolito; sin la parte `seed` (datos de la demo), que vive en el backend.

export type VerticalId = 'dental' | 'medico' | 'estetica'
export const VERTICAL_IDS: VerticalId[] = ['dental', 'medico', 'estetica']

export function esVertical(v: unknown): v is VerticalId {
  return typeof v === 'string' && (VERTICAL_IDS as string[]).includes(v)
}

export interface Feature { t: string; d: string; icon: string }

export interface VerticalConfig {
  id: VerticalId
  nombreCorto: string
  nombreLargo: string
  badge: string
  headlinePre: string
  headlineHi: string
  subtitle: string
  terminoPaciente: string
  terminoLugar: string
  ejemploNombre: string
  features: Feature[]
  testimonios: { n: string; r: string; t: string }[]
}

const I = {
  agenda: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  wa: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  ficha: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  presupuesto: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  cobros: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  liquidaciones: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z',
  google: 'M21 12.1H3M16 6l-4-4-4 4M8 18l4 4 4-4',
  reportes: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  app: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
}

export const VERTICALES: Record<VerticalId, VerticalConfig> = {
  dental: {
    id: 'dental',
    nombreCorto: 'Clínicas dentales',
    nombreLargo: 'Clínicas dentales',
    badge: 'Software dental',
    headlinePre: 'La clínica dental que se ',
    headlineHi: 'ordena sola',
    subtitle:
      'Agenda, fichas clínicas con odontograma, presupuestos, cobros y liquidaciones en un solo lugar — con confirmaciones automáticas por WhatsApp para que dejes de perder horas con inasistencias.',
    terminoPaciente: 'pacientes',
    terminoLugar: 'clínica',
    ejemploNombre: 'Clínica Dental Sonríe',
    features: [
      { t: 'Agenda inteligente', d: 'Vista semanal por profesional y diaria tipo planilla. Arrastra para reagendar, evita choques de horario y bloquea espacios.', icon: I.agenda },
      { t: 'Confirmación por WhatsApp', d: 'Recordatorios automáticos con botones. El paciente confirma o cancela y la cita se actualiza sola. Menos inasistencias.', icon: I.wa },
      { t: 'Ficha clínica y odontograma', d: 'Historial completo, odontograma interactivo, alertas médicas y evoluciones por paciente.', icon: I.ficha },
      { t: 'Presupuestos profesionales', d: 'Arma presupuestos por sección, imprímelos con tu logo y conviértelos en tratamientos con un clic.', icon: I.presupuesto },
      { t: 'Cobros y caja', d: 'Registra cobros con medios de pago y comisiones, abre y cierra caja, y controla el flujo diario.', icon: I.cobros },
      { t: 'Liquidaciones de profesionales', d: 'Calcula honorarios por profesional, período y comisión. Cada doctor ve solo lo suyo.', icon: I.liquidaciones },
      { t: 'Sincronización con Google', d: 'Conecta el calendario de Google de tu clínica: la agenda se mantiene en ambos lados.', icon: I.google },
      { t: 'Reportes y métricas', d: 'Ingresos, citas por estado, morosidad y rendimiento por profesional, en gráficos claros.', icon: I.reportes },
      { t: 'App instalable y segura', d: 'Funciona como app en el celular o el computador. Datos cifrados, accesos por rol y respaldos en la nube.', icon: I.app },
    ],
    testimonios: [
      { n: 'Dra. Carolina Méndez', r: 'Clínica dental, Temuco', t: 'Bajamos las inasistencias casi a la mitad con las confirmaciones automáticas. La recepción dejó de perder tiempo llamando uno por uno.' },
      { n: 'Dr. Rodrigo Salas', r: 'Centro odontológico, Valdivia', t: 'Tener la agenda, las fichas y los cobros en un mismo lugar nos ordenó por completo. Las liquidaciones salen solas.' },
      { n: 'Javiera Torres', r: 'Administradora, Pucón', t: 'Lo instalamos en el celular y se siente como una app de verdad. Súper simple para todo el equipo.' },
    ],
  },
  medico: {
    id: 'medico',
    nombreCorto: 'Centros médicos',
    nombreLargo: 'Centros médicos',
    badge: 'Software para centros médicos',
    headlinePre: 'El centro médico que ',
    headlineHi: 'funciona ordenado',
    subtitle:
      'Agenda multi-especialidad, ficha e historia clínica, cobros y bonos, y confirmaciones automáticas por WhatsApp para reducir las inasistencias de tus pacientes — todo en una sola plataforma.',
    terminoPaciente: 'pacientes',
    terminoLugar: 'centro',
    ejemploNombre: 'Centro Médico Vida',
    features: [
      { t: 'Agenda multi-especialidad', d: 'Vista por profesional y por box. Arrastra para reagendar, evita topes de horario y bloquea espacios para procedimientos.', icon: I.agenda },
      { t: 'Confirmación por WhatsApp', d: 'Recordatorios automáticos con botones. El paciente confirma, reagenda o cancela y la hora se actualiza sola.', icon: I.wa },
      { t: 'Ficha e historia clínica', d: 'Antecedentes, alertas médicas, medicamentos y evoluciones por consulta. Toda la historia del paciente a mano.', icon: I.ficha },
      { t: 'Presupuestos y órdenes', d: 'Arma presupuestos de prestaciones y procedimientos, imprímelos con tu logo y conviértelos en atenciones.', icon: I.presupuesto },
      { t: 'Cobros, bonos y caja', d: 'Registra cobros con medios de pago y convenios, abre y cierra caja, y controla el flujo diario.', icon: I.cobros },
      { t: 'Liquidaciones por profesional', d: 'Calcula honorarios por profesional, especialidad, período y comisión. Cada médico ve solo lo suyo.', icon: I.liquidaciones },
      { t: 'Sincronización con Google', d: 'Conecta el calendario de Google del centro: la agenda se mantiene en ambos lados.', icon: I.google },
      { t: 'Reportes y métricas', d: 'Ingresos, atenciones por estado, morosidad y rendimiento por profesional, en gráficos claros.', icon: I.reportes },
      { t: 'App instalable y segura', d: 'Funciona como app en el celular o el computador. Datos cifrados, accesos por rol y respaldos en la nube.', icon: I.app },
    ],
    testimonios: [
      { n: 'Dr. Felipe Aguirre', r: 'Centro médico, Temuco', t: 'Coordinar varias especialidades en una sola agenda nos cambió la operación. Ya no se nos topan las horas ni los boxes.' },
      { n: 'Dra. Natalia Rivas', r: 'Policlínico, Osorno', t: 'Las confirmaciones por WhatsApp redujeron muchísimo las inasistencias en controles crónicos.' },
      { n: 'Marcela Soto', r: 'Administradora, Villarrica', t: 'Tener la ficha, los cobros y las liquidaciones integrados nos ahorró horas de planilla cada semana.' },
    ],
  },
  estetica: {
    id: 'estetica',
    nombreCorto: 'Centros de estética',
    nombreLargo: 'Centros de estética',
    badge: 'Software para centros de estética',
    headlinePre: 'El centro de estética que ',
    headlineHi: 'fideliza y crece',
    subtitle:
      'Agenda por cabina y profesional, ficha de tus clientes, paquetes y abonos, comisiones del equipo y confirmaciones por WhatsApp para que no falten a sus sesiones — todo en una sola plataforma.',
    terminoPaciente: 'clientes',
    terminoLugar: 'centro',
    ejemploNombre: 'Centro de Estética Bella',
    features: [
      { t: 'Agenda por cabina y profesional', d: 'Vista por especialista y por box/cabina. Arrastra para reagendar, evita topes y bloquea horarios de equipos.', icon: I.agenda },
      { t: 'Confirmación por WhatsApp', d: 'Recordatorios automáticos con botones. La clienta confirma, reagenda o cancela y la sesión se actualiza sola.', icon: I.wa },
      { t: 'Ficha de cliente y tratamientos', d: 'Historial de sesiones, fotos de evolución, alergias y observaciones por clienta. Todo su recorrido a la vista.', icon: I.ficha },
      { t: 'Paquetes y presupuestos', d: 'Arma paquetes y presupuestos de tratamientos, imprímelos con tu marca y conviértelos en sesiones.', icon: I.presupuesto },
      { t: 'Cobros, abonos y caja', d: 'Registra abonos y pagos con medios y comisiones, abre y cierra caja, y controla el flujo del día.', icon: I.cobros },
      { t: 'Comisiones del equipo', d: 'Calcula comisiones por especialista, período y servicio. Cada profesional ve solo lo suyo.', icon: I.liquidaciones },
      { t: 'Sincronización con Google', d: 'Conecta el calendario de Google del centro: la agenda se mantiene en ambos lados.', icon: I.google },
      { t: 'Reportes y métricas', d: 'Ingresos, sesiones por estado, recurrencia de clientas y rendimiento por especialista, en gráficos claros.', icon: I.reportes },
      { t: 'App instalable y segura', d: 'Funciona como app en el celular o el computador. Datos cifrados, accesos por rol y respaldos en la nube.', icon: I.app },
    ],
    testimonios: [
      { n: 'Francisca Herrera', r: 'Centro de estética, Temuco', t: 'Las confirmaciones por WhatsApp nos bajaron muchísimo las inasistencias en sesiones de láser y faciales.' },
      { n: 'Daniela Muñoz', r: 'Spa & estética, Pucón', t: 'Llevar los paquetes y los abonos de cada clienta ordenado nos ayudó a fidelizar y a vender más sesiones.' },
      { n: 'Catalina Pinto', r: 'Administradora, Valdivia', t: 'Las comisiones del equipo, que antes calculaba a mano, ahora salen solas. Un cambio enorme.' },
    ],
  },
}

export function getVertical(id: string | null | undefined): VerticalConfig {
  return esVertical(id) ? VERTICALES[id] : VERTICALES.dental
}
