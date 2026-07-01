-- CreateTable
CREATE TABLE "Configuracion" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "nombre" TEXT NOT NULL DEFAULT 'Mi clínica',
    "rut" TEXT,
    "direccion" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL DEFAULT 'Temuco',
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "mensajeWA" TEXT NOT NULL DEFAULT 'Hola {nombre}, te escribimos de *{clinica}* para confirmar tu cita el {fecha} en {direccion}.',
    "waEnabled" BOOLEAN NOT NULL DEFAULT false,
    "waTwilioSid" TEXT,
    "waTwilioToken" TEXT,
    "waNumero" TEXT,
    "waTemplateSid" TEXT,
    "waHorasAntes" INTEGER NOT NULL DEFAULT 24,
    "googleRefreshToken" TEXT,
    "googleAccessToken" TEXT,
    "googleTokenExpiresAt" TIMESTAMP(3),
    "googleAccountEmail" TEXT,
    "googleConnectedAt" TIMESTAMP(3),
    "googleConnectedById" TEXT,
    "googleConnectedByName" TEXT,
    "metaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "metaPixelId" TEXT,
    "metaCapiToken" TEXT,
    "metaTestCode" TEXT,
    "crmToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "rut" TEXT,
    "especialidad" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "puedeRecibirPagos" BOOLEAN NOT NULL DEFAULT false,
    "puedeModificarPrecio" BOOLEAN NOT NULL DEFAULT false,
    "puedeAplicarDescuento" BOOLEAN NOT NULL DEFAULT false,
    "puedeRevertirCompletado" BOOLEAN NOT NULL DEFAULT false,
    "puedeEditarPagos" BOOLEAN NOT NULL DEFAULT false,
    "puedeGestionarLiquidaciones" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarId" TEXT,
    "googleSyncToken" TEXT,
    "googleSyncedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paciente" (
    "id" TEXT NOT NULL,
    "numero" INTEGER,
    "rut" TEXT,
    "otroDocId" TEXT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "nombreSocial" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "genero" TEXT,
    "sexo" TEXT,
    "nacionalidad" TEXT,
    "migrante" TEXT,
    "puebloOriginario" TEXT,
    "telefono" TEXT,
    "telefonoFijo" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "comuna" TEXT,
    "prevision" TEXT,
    "actividad" TEXT,
    "empleador" TEXT,
    "apoderado" TEXT,
    "rutApoderado" TEXT,
    "referencia" TEXT,
    "tipoPaciente" TEXT,
    "numeroInterno" TEXT,
    "alergias" TEXT,
    "antecedentes" TEXT,
    "observaciones" TEXT,
    "contactoEmergencia" TEXT,
    "telefonoEmergencia" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComentarioAdministrativo" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "autorId" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComentarioAdministrativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajePaciente" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "citaId" TEXT,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT,
    "enviadoA" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ENVIADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajePaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cita" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "duracion" INTEGER NOT NULL DEFAULT 30,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "tipo" TEXT,
    "notas" TEXT,
    "sala" TEXT,
    "sobrecupo" BOOLEAN NOT NULL DEFAULT false,
    "confirmadoWA" BOOLEAN NOT NULL DEFAULT false,
    "origen" TEXT,
    "linkAgendaId" TEXT,
    "googleEventId" TEXT,
    "googleSyncedAt" TIMESTAMP(3),
    "googleSyncError" TEXT,
    "waMessageSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitaLog" (
    "id" TEXT NOT NULL,
    "citaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT 'Sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitaLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaClinica" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "grupoSanguineo" TEXT,
    "fumador" BOOLEAN NOT NULL DEFAULT false,
    "embarazada" BOOLEAN NOT NULL DEFAULT false,
    "diabetico" BOOLEAN NOT NULL DEFAULT false,
    "hipertenso" BOOLEAN NOT NULL DEFAULT false,
    "cardiopatia" BOOLEAN NOT NULL DEFAULT false,
    "medicamentos" TEXT,
    "notasClinicas" TEXT,
    "alertasMedicas" TEXT,
    "enfermedadesNotas" TEXT,
    "motivoAtencion" TEXT,
    "impresionMedica" TEXT,
    "resumenDiagnostico" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaClinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diente" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "cara" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'SANO',
    "color" TEXT,
    "notas" TEXT,

    CONSTRAINT "Diente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DOUBLE PRECISION NOT NULL,
    "duracion" INTEGER NOT NULL DEFAULT 30,
    "categoria" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Prestacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tratamiento" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "planId" TEXT,
    "seccionId" TEXT,
    "prestacionId" TEXT NOT NULL,
    "doctorId" TEXT,
    "diente" INTEGER,
    "cara" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PLANIFICADO',
    "precio" DOUBLE PRECISION NOT NULL,
    "descuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletado" TIMESTAMP(3),

    CONSTRAINT "Tratamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTratamiento" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "doctorTitularId" TEXT,
    "nombre" TEXT NOT NULL DEFAULT 'Plan de tratamiento',
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "notas" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTratamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeccionPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'Sección',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaTentativa" TIMESTAMP(3),
    "diasDesdeAnterior" INTEGER,
    "notas" TEXT,

    CONSTRAINT "SeccionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evolucion" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "tratamientoId" TEXT,
    "autorId" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "vigencia" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPresupuesto" (
    "id" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "prestacionId" TEXT NOT NULL,
    "diente" INTEGER,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "descuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ItemPresupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedioPago" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "comision" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "requiereReferencia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MedioPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "montoNeto" DOUBLE PRECISION,
    "comisionMonto" DOUBLE PRECISION,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "medioPagoId" TEXT,
    "metodoPago" TEXT,
    "reciboUsuarioId" TEXT,
    "cajaId" TEXT,
    "fechaPago" TIMESTAMP(3),
    "notas" TEXT,
    "numeroReferencia" TEXT,
    "numeroBoleta" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivoAnulacion" TEXT,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "anuladoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "saldoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionCaja" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "saldoApertura" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "abiertaPorId" TEXT NOT NULL,
    "abiertaPorNombre" TEXT,
    "abiertaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaPorId" TEXT,
    "cerradaPorNombre" TEXT,
    "cerradaAt" TIMESTAMP(3),
    "saldoEsperado" DOUBLE PRECISION,
    "saldoReal" DOUBLE PRECISION,
    "diferencia" DOUBLE PRECISION,
    "totalIngresos" DOUBLE PRECISION,
    "totalEgresos" DOUBLE PRECISION,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CajaUsuario" (
    "cajaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CajaUsuario_pkey" PRIMARY KEY ("cajaId","userId")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "sesionCajaId" TEXT,
    "tipo" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cobroId" TEXT,
    "userId" TEXT NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivoAnulacion" TEXT,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "anuladoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CobroItem" (
    "id" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "tratamientoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CobroItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION,
    "montoFijo" DOUBLE PRECISION,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "totalBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLiquidado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "fechaPago" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionItem" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "tratamientoId" TEXT NOT NULL,
    "prestacionNombre" TEXT NOT NULL,
    "pacienteNombre" TEXT NOT NULL,
    "diente" TEXT,
    "fechaCompletado" TIMESTAMP(3) NOT NULL,
    "precioTratamiento" DOUBLE PRECISION NOT NULL,
    "porcentajeAplicado" DOUBLE PRECISION,
    "montoFijoAplicado" DOUBLE PRECISION,
    "montoLiquidado" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LiquidacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioDoctor" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "recesoActivo" BOOLEAN NOT NULL DEFAULT false,
    "recesoInicio" TEXT,
    "recesoFin" TEXT,
    "sobrecupoActivo" BOOLEAN NOT NULL DEFAULT false,
    "sobrecupoInicio" TEXT,
    "sobrecupoFin" TEXT,

    CONSTRAINT "HorarioDoctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueoAgenda" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "googleEventId" TEXT,
    "googleSyncedAt" TIMESTAMP(3),
    "googleSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloqueoAgenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_rut_key" ON "User"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_numero_key" ON "Paciente"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_rut_key" ON "Paciente"("rut");

-- CreateIndex
CREATE INDEX "Cita_googleEventId_idx" ON "Cita"("googleEventId");

-- CreateIndex
CREATE INDEX "Cita_waMessageSid_idx" ON "Cita"("waMessageSid");

-- CreateIndex
CREATE INDEX "Cita_doctorId_fecha_idx" ON "Cita"("doctorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "FichaClinica_pacienteId_key" ON "FichaClinica"("pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Diente_fichaId_numero_cara_key" ON "Diente"("fichaId", "numero", "cara");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_numero_key" ON "Presupuesto"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_numero_key" ON "Cobro"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Caja_nombre_key" ON "Caja"("nombre");

-- CreateIndex
CREATE INDEX "SesionCaja_cajaId_estado_idx" ON "SesionCaja"("cajaId", "estado");

-- CreateIndex
CREATE INDEX "SesionCaja_cajaId_abiertaAt_idx" ON "SesionCaja"("cajaId", "abiertaAt");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cajaId_fecha_idx" ON "MovimientoCaja"("cajaId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoCaja_sesionCajaId_idx" ON "MovimientoCaja"("sesionCajaId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioDoctor_doctorId_diaSemana_key" ON "HorarioDoctor"("doctorId", "diaSemana");

-- CreateIndex
CREATE INDEX "BloqueoAgenda_doctorId_inicio_idx" ON "BloqueoAgenda"("doctorId", "inicio");

-- CreateIndex
CREATE INDEX "BloqueoAgenda_googleEventId_idx" ON "BloqueoAgenda"("googleEventId");

-- AddForeignKey
ALTER TABLE "ComentarioAdministrativo" ADD CONSTRAINT "ComentarioAdministrativo_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajePaciente" ADD CONSTRAINT "MensajePaciente_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajePaciente" ADD CONSTRAINT "MensajePaciente_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitaLog" ADD CONSTRAINT "CitaLog_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaClinica" ADD CONSTRAINT "FichaClinica_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diente" ADD CONSTRAINT "Diente_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamiento" ADD CONSTRAINT "Tratamiento_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamiento" ADD CONSTRAINT "Tratamiento_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanTratamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamiento" ADD CONSTRAINT "Tratamiento_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "SeccionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamiento" ADD CONSTRAINT "Tratamiento_prestacionId_fkey" FOREIGN KEY ("prestacionId") REFERENCES "Prestacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamiento" ADD CONSTRAINT "Tratamiento_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTratamiento" ADD CONSTRAINT "PlanTratamiento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTratamiento" ADD CONSTRAINT "PlanTratamiento_doctorTitularId_fkey" FOREIGN KEY ("doctorTitularId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeccionPlan" ADD CONSTRAINT "SeccionPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanTratamiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evolucion" ADD CONSTRAINT "Evolucion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evolucion" ADD CONSTRAINT "Evolucion_tratamientoId_fkey" FOREIGN KEY ("tratamientoId") REFERENCES "Tratamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evolucion" ADD CONSTRAINT "Evolucion_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPresupuesto" ADD CONSTRAINT "ItemPresupuesto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPresupuesto" ADD CONSTRAINT "ItemPresupuesto_prestacionId_fkey" FOREIGN KEY ("prestacionId") REFERENCES "Prestacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_medioPagoId_fkey" FOREIGN KEY ("medioPagoId") REFERENCES "MedioPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_reciboUsuarioId_fkey" FOREIGN KEY ("reciboUsuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionCaja" ADD CONSTRAINT "SesionCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaUsuario" ADD CONSTRAINT "CajaUsuario_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaUsuario" ADD CONSTRAINT "CajaUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_sesionCajaId_fkey" FOREIGN KEY ("sesionCajaId") REFERENCES "SesionCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroItem" ADD CONSTRAINT "CobroItem_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroItem" ADD CONSTRAINT "CobroItem_tratamientoId_fkey" FOREIGN KEY ("tratamientoId") REFERENCES "Tratamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionItem" ADD CONSTRAINT "LiquidacionItem_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionItem" ADD CONSTRAINT "LiquidacionItem_tratamientoId_fkey" FOREIGN KEY ("tratamientoId") REFERENCES "Tratamiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioDoctor" ADD CONSTRAINT "HorarioDoctor_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueoAgenda" ADD CONSTRAINT "BloqueoAgenda_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LinkAgenda" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "doctorId" TEXT NOT NULL,
    "tipoCita" TEXT NOT NULL DEFAULT 'EVALUACION',
    "duracionMin" INTEGER NOT NULL DEFAULT 30,
    "usaHorarioDoctor" BOOLEAN NOT NULL DEFAULT true,
    "anticipacionHoras" INTEGER NOT NULL DEFAULT 12,
    "diasMaxFuturo" INTEGER NOT NULL DEFAULT 30,
    "mensajeConfirmacion" TEXT,
    "color" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkAgenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkAgenda_token_key" ON "LinkAgenda"("token");
CREATE INDEX "LinkAgenda_doctorId_idx" ON "LinkAgenda"("doctorId");

-- CreateTable
CREATE TABLE "LinkAgendaVentana" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "LinkAgendaVentana_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkAgendaVentana_linkId_idx" ON "LinkAgendaVentana"("linkId");

-- CreateTable
CREATE TABLE "LinkAgendaProfesional" (
    "linkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "LinkAgendaProfesional_pkey" PRIMARY KEY ("linkId", "userId")
);

-- CreateIndex
CREATE INDEX "LinkAgendaProfesional_userId_idx" ON "LinkAgendaProfesional"("userId");

-- AddForeignKey
ALTER TABLE "LinkAgenda" ADD CONSTRAINT "LinkAgenda_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LinkAgendaVentana" ADD CONSTRAINT "LinkAgendaVentana_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "LinkAgenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LinkAgendaProfesional" ADD CONSTRAINT "LinkAgendaProfesional_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "LinkAgenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LinkAgendaProfesional" ADD CONSTRAINT "LinkAgendaProfesional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "rut" TEXT,
    "motivo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'NUEVO',
    "origen" TEXT NOT NULL DEFAULT 'FORMULARIO',
    "campana" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "fbclid" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "referrer" TEXT,
    "landing" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "pacienteId" TEXT,
    "citaId" TEXT,
    "responsableId" TEXT,
    "metaEventId" TEXT,
    "metaEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_estado_createdAt_idx" ON "Lead"("estado", "createdAt");
CREATE INDEX "Lead_origen_idx" ON "Lead"("origen");

-- CreateTable
CREATE TABLE "LeadNota" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT,
    "autorNombre" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'NOTA',
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadNota_leadId_createdAt_idx" ON "LeadNota"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadNota" ADD CONSTRAINT "LeadNota_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

