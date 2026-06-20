
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  Serializable: 'Serializable'
});

exports.Prisma.ClinicaScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  nombre: 'nombre',
  rut: 'rut',
  direccion: 'direccion',
  ciudad: 'ciudad',
  telefono: 'telefono',
  email: 'email',
  logoUrl: 'logoUrl',
  mensajeWA: 'mensajeWA',
  plan: 'plan',
  activo: 'activo',
  trialHasta: 'trialHasta',
  cicloFacturacion: 'cicloFacturacion',
  precioAcordado: 'precioAcordado',
  proximoCobro: 'proximoCobro',
  notasInternas: 'notasInternas',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  googleRefreshToken: 'googleRefreshToken',
  googleAccessToken: 'googleAccessToken',
  googleTokenExpiresAt: 'googleTokenExpiresAt',
  googleAccountEmail: 'googleAccountEmail',
  googleConnectedAt: 'googleConnectedAt',
  googleConnectedById: 'googleConnectedById',
  googleConnectedByName: 'googleConnectedByName',
  waEnabled: 'waEnabled',
  waTwilioSid: 'waTwilioSid',
  waTwilioToken: 'waTwilioToken',
  waNumero: 'waNumero',
  waTemplateSid: 'waTemplateSid',
  waHorasAntes: 'waHorasAntes',
  esDemo: 'esDemo',
  demoExpiraEn: 'demoExpiraEn'
};

exports.Prisma.LeadScalarFieldEnum = {
  id: 'id',
  nombre: 'nombre',
  email: 'email',
  telefono: 'telefono',
  nombreClinica: 'nombreClinica',
  origen: 'origen',
  rubro: 'rubro',
  clinicaId: 'clinicaId',
  clinicaSlug: 'clinicaSlug',
  ip: 'ip',
  notas: 'notas',
  createdAt: 'createdAt'
};

exports.Prisma.ExtraSuscripcionScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  codigo: 'codigo',
  nombre: 'nombre',
  montoMensual: 'montoMensual',
  activo: 'activo',
  notas: 'notas',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PlanSuscripcionScalarFieldEnum = {
  id: 'id',
  nombre: 'nombre',
  descripcion: 'descripcion',
  precioMensual: 'precioMensual',
  precioAnual: 'precioAnual',
  caracteristicas: 'caracteristicas',
  destacado: 'destacado',
  orden: 'orden',
  activo: 'activo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PagoSuscripcionScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  fechaPago: 'fechaPago',
  monto: 'monto',
  periodoDesde: 'periodoDesde',
  periodoHasta: 'periodoHasta',
  metodoPago: 'metodoPago',
  comprobante: 'comprobante',
  notas: 'notas',
  registradoPor: 'registradoPor',
  createdAt: 'createdAt'
};

exports.Prisma.ConfiguracionScalarFieldEnum = {
  id: 'id',
  clinica: 'clinica',
  direccion: 'direccion',
  telefono: 'telefono',
  email: 'email',
  ciudad: 'ciudad',
  mensajeWA: 'mensajeWA',
  logoUrl: 'logoUrl'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  name: 'name',
  email: 'email',
  username: 'username',
  password: 'password',
  role: 'role',
  rut: 'rut',
  especialidad: 'especialidad',
  telefono: 'telefono',
  activo: 'activo',
  isPlatformAdmin: 'isPlatformAdmin',
  passwordChangedAt: 'passwordChangedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  puedeRecibirPagos: 'puedeRecibirPagos',
  puedeModificarPrecio: 'puedeModificarPrecio',
  puedeAplicarDescuento: 'puedeAplicarDescuento',
  puedeRevertirCompletado: 'puedeRevertirCompletado',
  puedeEditarPagos: 'puedeEditarPagos',
  puedeGestionarLiquidaciones: 'puedeGestionarLiquidaciones',
  googleCalendarId: 'googleCalendarId',
  googleSyncToken: 'googleSyncToken',
  googleSyncedAt: 'googleSyncedAt'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  sessionToken: 'sessionToken',
  userId: 'userId',
  expires: 'expires'
};

exports.Prisma.PacienteScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  numero: 'numero',
  rut: 'rut',
  otroDocId: 'otroDocId',
  nombre: 'nombre',
  apellido: 'apellido',
  nombreSocial: 'nombreSocial',
  fechaNacimiento: 'fechaNacimiento',
  genero: 'genero',
  sexo: 'sexo',
  nacionalidad: 'nacionalidad',
  migrante: 'migrante',
  puebloOriginario: 'puebloOriginario',
  telefono: 'telefono',
  telefonoFijo: 'telefonoFijo',
  email: 'email',
  direccion: 'direccion',
  ciudad: 'ciudad',
  comuna: 'comuna',
  prevision: 'prevision',
  actividad: 'actividad',
  empleador: 'empleador',
  apoderado: 'apoderado',
  rutApoderado: 'rutApoderado',
  referencia: 'referencia',
  tipoPaciente: 'tipoPaciente',
  numeroInterno: 'numeroInterno',
  alergias: 'alergias',
  antecedentes: 'antecedentes',
  observaciones: 'observaciones',
  activo: 'activo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComentarioAdministrativoScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  autorNombre: 'autorNombre',
  autorId: 'autorId',
  texto: 'texto',
  createdAt: 'createdAt'
};

exports.Prisma.MensajePacienteScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  citaId: 'citaId',
  tipo: 'tipo',
  categoria: 'categoria',
  asunto: 'asunto',
  cuerpo: 'cuerpo',
  enviadoA: 'enviadoA',
  estado: 'estado',
  createdAt: 'createdAt'
};

exports.Prisma.CitaScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  doctorId: 'doctorId',
  fecha: 'fecha',
  duracion: 'duracion',
  estado: 'estado',
  tipo: 'tipo',
  notas: 'notas',
  sala: 'sala',
  sobrecupo: 'sobrecupo',
  confirmadoWA: 'confirmadoWA',
  googleEventId: 'googleEventId',
  googleSyncedAt: 'googleSyncedAt',
  googleSyncError: 'googleSyncError',
  waMessageSid: 'waMessageSid',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CitaLogScalarFieldEnum = {
  id: 'id',
  citaId: 'citaId',
  tipo: 'tipo',
  detalle: 'detalle',
  userName: 'userName',
  createdAt: 'createdAt'
};

exports.Prisma.FichaClinicaScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  grupoSanguineo: 'grupoSanguineo',
  fumador: 'fumador',
  embarazada: 'embarazada',
  diabetico: 'diabetico',
  hipertenso: 'hipertenso',
  cardiopatia: 'cardiopatia',
  medicamentos: 'medicamentos',
  notasClinicas: 'notasClinicas',
  alertasMedicas: 'alertasMedicas',
  enfermedadesNotas: 'enfermedadesNotas',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DienteScalarFieldEnum = {
  id: 'id',
  fichaId: 'fichaId',
  numero: 'numero',
  cara: 'cara',
  estado: 'estado',
  color: 'color',
  notas: 'notas'
};

exports.Prisma.PrestacionScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  nombre: 'nombre',
  descripcion: 'descripcion',
  precio: 'precio',
  duracion: 'duracion',
  categoria: 'categoria',
  activo: 'activo'
};

exports.Prisma.TratamientoScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  fichaId: 'fichaId',
  planId: 'planId',
  seccionId: 'seccionId',
  prestacionId: 'prestacionId',
  doctorId: 'doctorId',
  diente: 'diente',
  cara: 'cara',
  estado: 'estado',
  precio: 'precio',
  descuento: 'descuento',
  notas: 'notas',
  fecha: 'fecha',
  fechaCompletado: 'fechaCompletado'
};

exports.Prisma.PlanTratamientoScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  doctorTitularId: 'doctorTitularId',
  nombre: 'nombre',
  estado: 'estado',
  notas: 'notas',
  fechaInicio: 'fechaInicio',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SeccionPlanScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  titulo: 'titulo',
  orden: 'orden',
  fechaTentativa: 'fechaTentativa',
  diasDesdeAnterior: 'diasDesdeAnterior',
  notas: 'notas'
};

exports.Prisma.EvolucionScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  tratamientoId: 'tratamientoId',
  autorId: 'autorId',
  texto: 'texto',
  createdAt: 'createdAt'
};

exports.Prisma.PresupuestoScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  numero: 'numero',
  estado: 'estado',
  total: 'total',
  notas: 'notas',
  vigencia: 'vigencia',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ItemPresupuestoScalarFieldEnum = {
  id: 'id',
  presupuestoId: 'presupuestoId',
  prestacionId: 'prestacionId',
  diente: 'diente',
  cantidad: 'cantidad',
  precioUnitario: 'precioUnitario',
  descuento: 'descuento',
  subtotal: 'subtotal'
};

exports.Prisma.MedioPagoScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  nombre: 'nombre',
  comision: 'comision',
  activo: 'activo'
};

exports.Prisma.CobroScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  pacienteId: 'pacienteId',
  numero: 'numero',
  concepto: 'concepto',
  monto: 'monto',
  montoNeto: 'montoNeto',
  comisionMonto: 'comisionMonto',
  estado: 'estado',
  medioPagoId: 'medioPagoId',
  metodoPago: 'metodoPago',
  reciboUsuarioId: 'reciboUsuarioId',
  cajaId: 'cajaId',
  fechaPago: 'fechaPago',
  notas: 'notas',
  anulado: 'anulado',
  motivoAnulacion: 'motivoAnulacion',
  anuladoAt: 'anuladoAt',
  anuladoPorId: 'anuladoPorId',
  anuladoPorNombre: 'anuladoPorNombre',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CajaScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  nombre: 'nombre',
  descripcion: 'descripcion',
  saldoInicial: 'saldoInicial',
  activo: 'activo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SesionCajaScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  cajaId: 'cajaId',
  estado: 'estado',
  saldoApertura: 'saldoApertura',
  abiertaPorId: 'abiertaPorId',
  abiertaPorNombre: 'abiertaPorNombre',
  abiertaAt: 'abiertaAt',
  cerradaPorId: 'cerradaPorId',
  cerradaPorNombre: 'cerradaPorNombre',
  cerradaAt: 'cerradaAt',
  saldoEsperado: 'saldoEsperado',
  saldoReal: 'saldoReal',
  diferencia: 'diferencia',
  totalIngresos: 'totalIngresos',
  totalEgresos: 'totalEgresos',
  observaciones: 'observaciones',
  createdAt: 'createdAt'
};

exports.Prisma.CajaUsuarioScalarFieldEnum = {
  cajaId: 'cajaId',
  userId: 'userId'
};

exports.Prisma.MovimientoCajaScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  cajaId: 'cajaId',
  sesionCajaId: 'sesionCajaId',
  tipo: 'tipo',
  monto: 'monto',
  descripcion: 'descripcion',
  categoria: 'categoria',
  fecha: 'fecha',
  cobroId: 'cobroId',
  userId: 'userId',
  anulado: 'anulado',
  motivoAnulacion: 'motivoAnulacion',
  anuladoAt: 'anuladoAt',
  anuladoPorId: 'anuladoPorId',
  anuladoPorNombre: 'anuladoPorNombre',
  createdAt: 'createdAt'
};

exports.Prisma.CobroItemScalarFieldEnum = {
  id: 'id',
  cobroId: 'cobroId',
  tratamientoId: 'tratamientoId',
  descripcion: 'descripcion',
  monto: 'monto'
};

exports.Prisma.ContratoScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  doctorId: 'doctorId',
  tipo: 'tipo',
  porcentaje: 'porcentaje',
  montoFijo: 'montoFijo',
  descripcion: 'descripcion',
  fechaInicio: 'fechaInicio',
  fechaFin: 'fechaFin',
  activo: 'activo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LiquidacionScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  doctorId: 'doctorId',
  contratoId: 'contratoId',
  periodo: 'periodo',
  totalBruto: 'totalBruto',
  totalLiquidado: 'totalLiquidado',
  estado: 'estado',
  notas: 'notas',
  fechaPago: 'fechaPago',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LiquidacionItemScalarFieldEnum = {
  id: 'id',
  liquidacionId: 'liquidacionId',
  tratamientoId: 'tratamientoId',
  prestacionNombre: 'prestacionNombre',
  pacienteNombre: 'pacienteNombre',
  diente: 'diente',
  fechaCompletado: 'fechaCompletado',
  precioTratamiento: 'precioTratamiento',
  porcentajeAplicado: 'porcentajeAplicado',
  montoFijoAplicado: 'montoFijoAplicado',
  montoLiquidado: 'montoLiquidado'
};

exports.Prisma.HorarioDoctorScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  doctorId: 'doctorId',
  diaSemana: 'diaSemana',
  horaInicio: 'horaInicio',
  horaFin: 'horaFin',
  activo: 'activo',
  recesoActivo: 'recesoActivo',
  recesoInicio: 'recesoInicio',
  recesoFin: 'recesoFin',
  sobrecupoActivo: 'sobrecupoActivo',
  sobrecupoInicio: 'sobrecupoInicio',
  sobrecupoFin: 'sobrecupoFin'
};

exports.Prisma.BloqueoAgendaScalarFieldEnum = {
  id: 'id',
  clinicaId: 'clinicaId',
  doctorId: 'doctorId',
  inicio: 'inicio',
  fin: 'fin',
  motivo: 'motivo',
  createdById: 'createdById',
  createdByName: 'createdByName',
  googleEventId: 'googleEventId',
  googleSyncedAt: 'googleSyncedAt',
  googleSyncError: 'googleSyncError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogAdminScalarFieldEnum = {
  id: 'id',
  actorId: 'actorId',
  actorEmail: 'actorEmail',
  action: 'action',
  targetType: 'targetType',
  targetId: 'targetId',
  details: 'details',
  ip: 'ip',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  Clinica: 'Clinica',
  Lead: 'Lead',
  ExtraSuscripcion: 'ExtraSuscripcion',
  PlanSuscripcion: 'PlanSuscripcion',
  PagoSuscripcion: 'PagoSuscripcion',
  Configuracion: 'Configuracion',
  User: 'User',
  Session: 'Session',
  Paciente: 'Paciente',
  ComentarioAdministrativo: 'ComentarioAdministrativo',
  MensajePaciente: 'MensajePaciente',
  Cita: 'Cita',
  CitaLog: 'CitaLog',
  FichaClinica: 'FichaClinica',
  Diente: 'Diente',
  Prestacion: 'Prestacion',
  Tratamiento: 'Tratamiento',
  PlanTratamiento: 'PlanTratamiento',
  SeccionPlan: 'SeccionPlan',
  Evolucion: 'Evolucion',
  Presupuesto: 'Presupuesto',
  ItemPresupuesto: 'ItemPresupuesto',
  MedioPago: 'MedioPago',
  Cobro: 'Cobro',
  Caja: 'Caja',
  SesionCaja: 'SesionCaja',
  CajaUsuario: 'CajaUsuario',
  MovimientoCaja: 'MovimientoCaja',
  CobroItem: 'CobroItem',
  Contrato: 'Contrato',
  Liquidacion: 'Liquidacion',
  LiquidacionItem: 'LiquidacionItem',
  HorarioDoctor: 'HorarioDoctor',
  BloqueoAgenda: 'BloqueoAgenda',
  AuditLogAdmin: 'AuditLogAdmin'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
