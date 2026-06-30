// ─────────────────────────────────────────────────────────────────────────────
//  Manual de ayuda de Cláriva
// ─────────────────────────────────────────────────────────────────────────────
//
//  Cada artículo se indexa con Fuse.js sobre title + keywords + body. El widget
//  flotante (HelpWidget) busca acá; la página /ayuda muestra el catálogo
//  completo agrupado por categoría.
//
//  Cómo escribir un buen artículo:
//   - title: lenguaje natural ("Cómo crear una cita"), 4-8 palabras.
//   - keywords: sinónimos comunes para que el matching encuentre el artículo
//     aunque el usuario use palabras distintas. NO repitas palabras del título.
//   - body: markdown simple. Numerá pasos cuando sea procedimiento. Usá
//     **negrita** para nombres de botones y módulos.
//   - relatedIds: IDs de artículos relacionados para "Ver también".

export interface HelpArticle {
  id: string
  title: string
  category: HelpCategory
  keywords: string[]
  body: string
  relatedIds?: string[]
}

export type HelpCategory =
  | 'empezando'
  | 'agenda'
  | 'agendamiento-online'
  | 'pacientes'
  | 'cobros'
  | 'tratamientos'
  | 'presupuestos'
  | 'liquidaciones'
  | 'equipo'
  | 'google'
  | 'configuracion'
  | 'problemas'

export const HELP_CATEGORIES: { id: HelpCategory; label: string; emoji: string; description: string }[] = [
  { id: 'empezando',     label: 'Primeros pasos',         emoji: '🚀', description: 'Login, contraseña, navegación básica' },
  { id: 'agenda',        label: 'Agenda',                  emoji: '📅', description: 'Citas, sobrecupos, bloqueos, horarios' },
  { id: 'agendamiento-online', label: 'Agendamiento online', emoji: '🔗', description: 'Links públicos de reserva, confirmar reservas' },
  { id: 'pacientes',     label: 'Pacientes',               emoji: '👤', description: 'Crear, buscar, importar, ficha clínica' },
  { id: 'cobros',        label: 'Cobros y caja',           emoji: '💵', description: 'Abrir caja, recaudar, cerrar, gastos' },
  { id: 'tratamientos',  label: 'Tratamientos y planes',   emoji: '🦷', description: 'Tratamientos, plan, odontograma' },
  { id: 'presupuestos',  label: 'Presupuestos',            emoji: '📝', description: 'Crear, imprimir, convertir a tratamientos' },
  { id: 'liquidaciones', label: 'Liquidaciones',           emoji: '💰', description: 'Honorarios de doctores, contratos' },
  { id: 'equipo',        label: 'Equipo y permisos',       emoji: '👥', description: 'Usuarios, roles, contratos' },
  { id: 'google',        label: 'Google Calendar',         emoji: '🔄', description: 'Sincronización con Google' },
  { id: 'configuracion', label: 'Configuración',           emoji: '⚙️', description: 'Datos de clínica, medios de pago, WhatsApp' },
  { id: 'problemas',     label: 'Resolver problemas',      emoji: '🛟', description: 'Errores comunes y cómo solucionarlos' },
]

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── EMPEZANDO ───────────────────────────────────────────────────────────
  {
    id: 'primer-ingreso',
    title: 'Cómo entro por primera vez a la plataforma',
    category: 'empezando',
    keywords: ['login', 'iniciar sesión', 'usuario', 'password', 'primera vez', 'acceso'],
    body: `
1. Abrí el enlace de tu clínica (ejemplo: \`https://tuclinica.clariva.cl/login\`).
2. Ingresá tu **usuario** y **contraseña** (te las entregó el administrador).
3. La primera vez te va a pedir que **cambies la contraseña**. Elegí una de al menos 6 caracteres y guardala en un lugar seguro.
4. Listo. Vas a entrar a la **Agenda** por defecto.

Si no tenés tus credenciales, contactá al administrador de tu clínica.
    `,
    relatedIds: ['cambiar-password', 'olvide-password'],
  },
  {
    id: 'cambiar-password',
    title: 'Cómo cambio mi contraseña',
    category: 'empezando',
    keywords: ['clave', 'cambiar', 'modificar', 'actualizar contraseña', 'seguridad'],
    body: `
1. Andá a tu nombre de usuario arriba a la derecha → **Mi cuenta**.
2. Tocá **Cambiar contraseña**.
3. Ingresá tu contraseña actual y la nueva (mínimo 6 caracteres).
4. **Guardar**.

A partir del siguiente login vas a usar la nueva.
    `,
    relatedIds: ['olvide-password'],
  },
  {
    id: 'olvide-password',
    title: 'Olvidé mi contraseña',
    category: 'empezando',
    keywords: ['recuperar', 'reset', 'reseteo', 'no me acuerdo'],
    body: `
La plataforma todavía no tiene flujo de "olvidé mi contraseña" por email. Por seguridad:

1. Contactá al **administrador de tu clínica**.
2. El admin puede entrar a **Equipo** → tu usuario → editar y asignarte una nueva contraseña.
3. En tu próximo login te va a pedir que la cambies por una propia.

Si vos sos el admin y olvidaste tu password, contactá al soporte de la plataforma.
    `,
    relatedIds: ['cambiar-password'],
  },
  {
    id: 'cerrar-sesion',
    title: 'Cómo cierro sesión',
    category: 'empezando',
    keywords: ['logout', 'salir', 'desloguearse'],
    body: `
Click en tu nombre arriba a la derecha y elegí **Cerrar sesión**.

Si tu equipo es compartido (recepción), cerrá sesión siempre al terminar para que otra persona no use tu cuenta.
    `,
  },
  {
    id: 'mis-permisos',
    title: 'Por qué no veo cierto módulo o botón',
    category: 'empezando',
    keywords: ['permisos', 'no me deja', 'sin acceso', 'oculto', 'no aparece'],
    body: `
La plataforma usa **permisos por usuario**. Vos solo ves lo que tu rol y permisos te habilitan.

Roles:
- **admin**: ve todo, gestiona todo.
- **doctor / médico**: ve agenda propia, fichas, su liquidación.
- **staff**: agenda, pacientes, cobros (si tiene el permiso).

Si necesitás un permiso (por ejemplo, "recibir pagos" o "editar pagos"), pedile al administrador que lo active desde **Equipo** → tu usuario → toggles de permisos.
    `,
    relatedIds: ['crear-usuario', 'editar-permisos-usuario'],
  },

  // ─── AGENDA ──────────────────────────────────────────────────────────────
  {
    id: 'vistas-agenda',
    title: 'Qué vistas tiene la agenda y cuándo usar cada una',
    category: 'agenda',
    keywords: ['vista', 'calendario', 'semanal', 'diaria', 'global', 'cambiar'],
    body: `
La agenda tiene 3 vistas, arriba a la derecha:

- **Diaria**: lista compacta con hora, paciente, doctor y estado. Útil para el día actual cuando querés ver todo de un vistazo.
- **Semanal**: calendario tipo FullCalendar con la semana completa, una columna por día. Sirve para planificar la semana.
- **Diaria global**: una columna por dentista para el día seleccionado. Útil cuando varios profesionales atienden el mismo día y querés comparar agendas.

Cambiás entre vistas con los botones arriba a la derecha. Las 3 muestran citas y bloqueos.
    `,
    relatedIds: ['crear-cita', 'bloquear-horario'],
  },
  {
    id: 'crear-cita',
    title: 'Cómo creo una cita',
    category: 'agenda',
    keywords: ['agendar', 'reservar', 'nueva cita', 'horario', 'agendamiento'],
    body: `
1. Andá a **Agenda**.
2. Click en un horario libre del calendario (cuadrito verde claro). También podés tocar el botón **Nueva cita** arriba a la derecha.
3. Elegí el **paciente** (buscando por nombre o RUT) o creá uno nuevo en el momento.
4. Seleccioná **doctor**, **motivo** (consulta, control, etc.) y **duración**.
5. Agregá **notas** si necesitás.
6. **Guardar**.

La cita aparece en la agenda con el color del estado (Pendiente: amarillo, Confirmada: cyan, Atendida: verde, etc.).
    `,
    relatedIds: ['cambiar-estado-cita', 'mover-cita', 'crear-sobrecupo', 'confirmar-whatsapp'],
  },
  {
    id: 'cambiar-estado-cita',
    title: 'Cómo cambio el estado de una cita',
    category: 'agenda',
    keywords: ['confirmar', 'atender', 'cancelar', 'no asistió', 'estado'],
    body: `
1. Click en la cita en la agenda.
2. En el modal vas a ver los estados disponibles: **Pendiente**, **Confirmada**, **Atendida**, **Cancelada**, **No asistió**.
3. Click en el estado nuevo.

Cada cambio queda registrado con tu nombre, hora y estado anterior, en el **Historial** del modal.
    `,
    relatedIds: ['confirmar-whatsapp'],
  },
  {
    id: 'confirmar-whatsapp',
    title: 'Cómo confirmo una cita por WhatsApp',
    category: 'agenda',
    keywords: ['whatsapp', 'wa', 'mensaje', 'recordatorio', 'confirmar paciente'],
    body: `
1. Click en la cita.
2. Botón **Confirmar por WhatsApp**.
3. Se abre WhatsApp Web (o tu app móvil) con un mensaje pre-armado con el nombre del paciente, fecha, hora y dirección de la clínica.
4. Enviá el mensaje.

La cita queda marcada con un check verde ✓. El paciente debe necesariamente tener teléfono cargado en su ficha; sino, el botón te avisa que falta.

Podés personalizar el mensaje en **Configuración** → Plantilla de WhatsApp.
    `,
    relatedIds: ['plantilla-whatsapp'],
  },
  {
    id: 'mover-cita',
    title: 'Cómo cambio una cita de fecha u hora',
    category: 'agenda',
    keywords: ['reprogramar', 'mover', 'arrastrar', 'cambiar fecha', 'cambiar hora'],
    body: `
**En vista Semanal:** podés arrastrar la cita con el mouse a un nuevo horario.

**En cualquier vista:**
1. Click en la cita.
2. Tocá **Editar**.
3. Cambiá la **fecha y hora**.
4. **Guardar**.

El cambio se sincroniza automáticamente con Google Calendar (si tenés conectado).
    `,
    relatedIds: ['crear-cita', 'google-conectar'],
  },
  {
    id: 'cancelar-cita',
    title: 'Cómo cancelo una cita',
    category: 'agenda',
    keywords: ['anular', 'eliminar', 'borrar cita', 'cancelar paciente'],
    body: `
1. Click en la cita.
2. Cambiá el estado a **Cancelada**.

La cita queda en el calendario tachada/coloreada de rojo, con el motivo si lo agregás en notas. El horario vuelve a estar disponible para otra cita.

Si conectaste Google Calendar, el evento se elimina automáticamente del calendario del dentista.

**Para borrarla completamente** (no recomendado, pierde trazabilidad): botón **Eliminar** dentro del modal.
    `,
    relatedIds: ['cambiar-estado-cita'],
  },
  {
    id: 'crear-sobrecupo',
    title: 'Cómo creo un sobrecupo',
    category: 'agenda',
    keywords: ['sobreagendamiento', 'overbooking', 'urgencia', 'sobre horario', 'extra'],
    body: `
Un sobrecupo es una cita extra que se agenda **fuera del horario regular del doctor** o por sobre otra cita (típico para urgencias).

1. En la agenda, arriba donde dice "Citas hoy", cambiá al modo **Sobre Agendamiento** (color naranja).
2. Click en cualquier horario y creá la cita normalmente.

Los sobrecupos se ven con un borde naranja y un ⚠. Tienen una agenda paralela: no compiten con las citas normales por el mismo slot.

Para que un doctor pueda recibir sobrecupos, su horario debe tener activado el bloque de sobrecupo. Lo configura el admin en **Equipo** → doctor → Horario.
    `,
    relatedIds: ['configurar-horario-doctor'],
  },
  {
    id: 'bloquear-horario',
    title: 'Cómo bloqueo un horario (vacaciones, capacitación)',
    category: 'agenda',
    keywords: ['bloqueo', 'no disponible', 'vacaciones', 'feriado', 'capacitación', 'ausencia'],
    body: `
1. En **Agenda**, arriba a la derecha, botón **Bloquear horario** (al lado de Nueva cita).
2. Elegí el **doctor** (si sos admin podés bloquear a cualquiera; si sos doctor común solo a ti mismo).
3. Definí **desde** y **hasta** (fecha y hora).
4. **Motivo** opcional ("Vacaciones", "Capacitación", "Almuerzo extra").
5. **Bloquear horario**.

El bloque aparece en la agenda en gris oscuro con 🚫. Mientras esté activo no se pueden agendar citas en ese horario — si alguien intenta, recibe error 409 con el motivo del bloqueo.

Para **eliminar** un bloqueo: click en el bloque gris → botón **Eliminar bloqueo**.
    `,
    relatedIds: ['vistas-agenda'],
  },
  {
    id: 'configurar-horario-doctor',
    title: 'Cómo configuro el horario semanal de un doctor',
    category: 'agenda',
    keywords: ['horario', 'jornada', 'semana', 'días', 'turnos'],
    body: `
**Solo admin.**

1. **Equipo** → click en el ícono de reloj del doctor.
2. Marcá los días de la semana en los que atiende y la hora **desde** y **hasta** de cada día.
3. (Opcional) **Receso**: marcá horario de almuerzo (ej. 13:00 a 14:00). Esos slots aparecen como fuera de horario en la agenda.
4. (Opcional) **Sobrecupos**: si el doctor recibe urgencias fuera de su horario regular, activá esto y definí el rango.
5. **Guardar**.

Los cambios afectan la **agenda visualmente** (slots habilitados/deshabilitados) pero NO afectan citas ya creadas en horarios que después se hayan inhabilitado.
    `,
    relatedIds: ['crear-sobrecupo', 'bloquear-horario'],
  },
  {
    id: 'eliminar-cita',
    title: 'Cómo elimino una cita definitivamente',
    category: 'agenda',
    keywords: ['borrar cita', 'eliminar definitivo'],
    body: `
**Lo recomendado es cancelarla** (estado: Cancelada) para mantener trazabilidad.

Si necesitás borrarla completamente:
1. Click en la cita.
2. Botón **Eliminar** (rojo).
3. Confirmá.

La cita desaparece de la base y, si había evento en Google Calendar, también se elimina ahí.

⚠ Una vez eliminada no se recupera. No hay papelera.
    `,
    relatedIds: ['cancelar-cita'],
  },

  // ─── AGENDAMIENTO ONLINE ──────────────────────────────────────────────────
  {
    id: 'crear-link-agendamiento',
    title: 'Cómo creo un link de agendamiento online',
    category: 'agendamiento-online',
    keywords: ['link', 'agendamiento online', 'reserva online', 'agenda online', 'agenda publica', 'reservar hora', 'online', 'pacientes reservan', 'auto agendamiento', 'enlace'],
    body: `
El agendamiento online es un **link público** que compartís con tus pacientes para que **reserven su hora solos**, dentro de tu disponibilidad. Las reservas entran a tu agenda en estado **Pendiente** para que las confirmes.

1. Andá a **Administración → Agendamiento online**.
2. Tocá **+ Nuevo link**.
3. Completá:
   - **Nombre del link** (ej. "Evaluaciones Dr. Aedo").
   - **Profesionales disponibles**: marcá uno o varios (si marcás varios, el paciente elige con quién).
   - **Tipo / etiqueta** (ej. EVALUACION) y **duración** de cada hora.
   - **Antelación** mínima (horas) y **días a futuro** que se pueden reservar.
   - **Disponibilidad**: usar el horario del profesional, o definir **ventanas propias** del link.
   - (Opcional) **Mensaje de confirmación**.
4. **Guardar**.
5. En la tarjeta del link tocá **Copiar** para copiar la URL y compartirla (WhatsApp, Instagram, web, campañas), o **Abrir** para verla.

Podés **pausar/activar** o **editar** un link cuando quieras, y ver sus **reservas**.
    `,
    relatedIds: ['link-varios-profesionales', 'disponibilidad-link', 'confirmar-reservas-online'],
  },
  {
    id: 'link-varios-profesionales',
    title: 'Cómo pongo varios profesionales en un link de agendamiento',
    category: 'agendamiento-online',
    keywords: ['varios profesionales', 'multiples doctores', 'campaña', 'elegir profesional', 'dos doctores', 'tres doctores', 'online'],
    body: `
Un link puede ofrecer **uno o varios profesionales** (útil para campañas donde atienden 2 o 3).

1. Al crear o editar el link, en **Profesionales disponibles** marcá los que correspondan (lista con casillas).
2. **Guardar**.

En la página pública:
- Si el link tiene **un** profesional, el paciente va directo a elegir día y hora.
- Si tiene **varios**, el paciente primero **elige el profesional**, y la disponibilidad se ajusta a ese profesional (su horario menos sus citas y bloqueos). La cita queda con el profesional elegido.
    `,
    relatedIds: ['crear-link-agendamiento', 'disponibilidad-link'],
  },
  {
    id: 'disponibilidad-link',
    title: 'Cómo defino la disponibilidad de un link (horario o ventanas)',
    category: 'agendamiento-online',
    keywords: ['disponibilidad', 'ventanas', 'horario', 'cupos online', 'bloques', 'evaluaciones', 'cuando reservan', 'online'],
    body: `
La disponibilidad de un link es **híbrida**:

- **Usar el horario del profesional** (recomendado para la mayoría): los cupos salen del horario semanal del profesional (descontando receso, citas y bloqueos).
- **Ventanas propias del link**: definís días y rangos exclusivos para ese link (ej. "Evaluaciones: Lunes y Miércoles de 15:00 a 18:00"). Solo en esas franjas se ofrecen cupos. Ideal para reservar bloques dedicados a un tipo de atención.

Para usar ventanas: en el link, **destildá** "Usar el horario del profesional" y agregá las ventanas (día + hora de inicio y fin).

Los cupos se generan en pasos de la **duración** del link. El paciente puede tocar **"Ver más fechas"** en la página pública para abrir un calendario y mirar hacia adelante.
    `,
    relatedIds: ['crear-link-agendamiento', 'configurar-horario-doctor'],
  },
  {
    id: 'confirmar-reservas-online',
    title: 'Cómo confirmo las reservas online de los pacientes',
    category: 'agendamiento-online',
    keywords: ['confirmar reserva', 'reservas pendientes', 'aviso agenda', 'confirmar online', 'pendiente de confirmar', 'online'],
    body: `
Cuando un paciente reserva por un link, la cita entra a tu **Agenda** en estado **Pendiente** y aparece un **aviso** arriba de la agenda: "N reservas online por confirmar".

1. Andá a **Agenda**.
2. Tocá el aviso ámbar **"Ver y confirmar →"** (aparece solo si hay reservas pendientes).
3. Se abre una ventana con cada reserva: paciente, teléfono, fecha y hora, profesional y motivo.
4. Por cada una podés:
   - **Confirmar** → la cita queda **Confirmada**.
   - **WhatsApp** → escribirle al paciente para confirmar.
   - **Cancelar** → libera el cupo.

También podés ver las reservas de un link puntual desde **Administración → Agendamiento online → Ver reservas**.
    `,
    relatedIds: ['crear-link-agendamiento', 'cambiar-estado-cita'],
  },

  // ─── PACIENTES ───────────────────────────────────────────────────────────
  {
    id: 'crear-paciente',
    title: 'Cómo creo un nuevo paciente',
    category: 'pacientes',
    keywords: ['nuevo paciente', 'agregar', 'alta', 'registrar persona'],
    body: `
1. Andá a **Pacientes**.
2. Click en **Nuevo paciente** arriba a la derecha.
3. Completá los datos: **nombre, apellido, RUT** (o documento extranjero), teléfono, email, etc.
4. (Opcional) Agregá previsión, alergias, observaciones.
5. **Guardar**.

Mínimo necesitás nombre y apellido. RUT es opcional (útil para extranjeros sin RUT).

También podés crear pacientes desde la **agenda** cuando estás creando una cita, en el mismo modal.
    `,
    relatedIds: ['buscar-paciente', 'editar-paciente', 'importar-pacientes'],
  },
  {
    id: 'buscar-paciente',
    title: 'Cómo busco a un paciente',
    category: 'pacientes',
    keywords: ['encontrar', 'buscar', 'localizar', 'rut', 'nombre'],
    body: `
**Buscador global (lo más rápido):** en la barra superior de la plataforma hay un buscador. Escribí **nombre, apellido o RUT** (con o sin guión y dígito verificador). Apretá Enter o atajo \`/\`.

Te muestra los resultados al instante. Click → ficha del paciente.

**Listado de pacientes:** **Pacientes** → buscar en la barra superior del listado. Mismo comportamiento.

Tip: podés buscar combinando, ej. "Juan Pérez" o "Pérez Juan" → encuentra igual.
    `,
    relatedIds: ['crear-paciente'],
  },
  {
    id: 'editar-paciente',
    title: 'Cómo edito los datos de un paciente',
    category: 'pacientes',
    keywords: ['modificar', 'actualizar paciente', 'corregir', 'datos'],
    body: `
1. Andá a la **ficha del paciente** (desde el buscador o el listado).
2. Sección **Datos personales** → botón **Editar**.
3. Modificá lo que necesites.
4. **Guardar**.

Los cambios se reflejan inmediatamente en todas las partes que muestran el paciente (agenda, cobros, etc.).
    `,
  },
  {
    id: 'importar-pacientes',
    title: 'Cómo importo pacientes desde un Excel',
    category: 'pacientes',
    keywords: ['excel', 'csv', 'masivo', 'cargar', 'importar archivo'],
    body: `
1. **Pacientes** → botón **Importar** (icono de subida).
2. Descargá la **plantilla** modelo si nunca importaste (botón "Descargar plantilla").
3. Completá la plantilla con los datos: Nombres, Apellidos, RUT, Teléfono, Email, Dirección, Fecha de nacimiento.
4. Subí el archivo Excel.
5. La plataforma detecta duplicados por RUT (si dos pacientes tienen el mismo RUT, no se duplica).
6. Confirmá la importación.

Te muestra al final un resumen: **N pacientes nuevos creados** y **M omitidos** (con la razón: duplicado, datos faltantes, etc.).
    `,
    relatedIds: ['exportar-pacientes'],
  },
  {
    id: 'exportar-pacientes',
    title: 'Cómo descargo mis pacientes en Excel',
    category: 'pacientes',
    keywords: ['exportar', 'descargar', 'bajar', 'backup'],
    body: `
**Pacientes** → botón **Exportar** (icono de descarga).

Descargás un Excel con todos los pacientes activos de la clínica con sus datos completos. Sirve para:
- Backup propio.
- Análisis externo.
- Mover datos a otra plataforma.

El archivo es \`.xlsx\` y se descarga al instante.
    `,
    relatedIds: ['importar-pacientes'],
  },
  {
    id: 'ficha-clinica',
    title: 'Qué tiene la ficha clínica de un paciente',
    category: 'pacientes',
    keywords: ['ficha', 'historia', 'expediente', 'historial paciente'],
    body: `
La ficha de cada paciente tiene:

- **Datos personales**: nombre, RUT, teléfono, etc.
- **Odontograma**: dientes con su estado clínico.
- **Tratamientos**: historial de tratamientos planificados, completados y anulados.
- **Plan de tratamiento**: organización por secciones de tratamientos a realizar.
- **Citas**: historial de citas con su estado.
- **Presupuestos**: presupuestos generados al paciente.
- **Cobros / Facturación y pagos**: todos los cobros y abonos recibidos.
- **Recibir pago**: tab para recaudar (si tenés el permiso).
- **Mensajes** y **comentarios administrativos**.

Cada sección tiene su propia tab. Cambiá de tab con los botones arriba.
    `,
    relatedIds: ['recibir-pago', 'odontograma'],
  },
  {
    id: 'odontograma',
    title: 'Cómo uso el odontograma',
    category: 'pacientes',
    keywords: ['dientes', 'piezas', 'caries', 'estado dental'],
    body: `
En la ficha del paciente, tab **Odontograma**.

Click en cada diente para abrir el menú de estados clínicos: sano, caries, obturación, endodoncia, corona, prótesis, ausente, etc.

Podés marcar **caras específicas** del diente (oclusal, mesial, distal, vestibular, lingual).

Los cambios se guardan automáticamente. No hay botón "Guardar" — todo es autosave.

El odontograma se imprime en presupuestos y planes de tratamiento.
    `,
  },
  {
    id: 'desactivar-paciente',
    title: 'Cómo doy de baja a un paciente',
    category: 'pacientes',
    keywords: ['inactivo', 'eliminar', 'baja', 'archivar'],
    body: `
La plataforma no borra pacientes (perderías el historial). En su lugar, **se desactivan**:

1. Andá a la ficha del paciente.
2. En **Datos personales** → tocá el toggle **Activo** para apagarlo.
3. **Guardar**.

El paciente desaparece del buscador y los listados, pero conserva su historial. Podés reactivarlo en cualquier momento.
    `,
  },

  // ─── COBROS Y CAJA ───────────────────────────────────────────────────────
  {
    id: 'caja-conceptos',
    title: 'Cómo funciona el módulo de Caja',
    category: 'cobros',
    keywords: ['caja', 'sesión', 'apertura', 'cierre', 'concepto', 'cuadre'],
    body: `
**Cada caja** representa un punto de cobro físico (ej. "Recepción", "Caja Principal").

**Cada caja tiene sesiones**: cada vez que abrís la caja con un saldo declarado, arranca una **sesión** que se cierra cuando hacés el arqueo. Las sesiones quedan en el **Historial de cierres**.

Estados de una caja:
- **Sin sesión**: nunca se abrió. Para usarla, hay que abrirla primero.
- **Abierta**: hay una sesión activa que puede recibir cobros y gastos.
- **Cerrada**: la última sesión está cerrada. Para usarla otra vez, hay que abrirla declarando el nuevo saldo de inicio.

**Solo cajas con sesión ABIERTA pueden recibir cobros**.
    `,
    relatedIds: ['abrir-caja', 'cerrar-caja', 'registrar-cobro'],
  },
  {
    id: 'abrir-caja',
    title: 'Cómo abro una caja',
    category: 'cobros',
    keywords: ['apertura', 'saldo inicial', 'comenzar día'],
    body: `
1. **Cobros** → **Caja**.
2. Elegí la caja que querés abrir y tocá **Abrir caja**.
3. **Contá el efectivo** que tenés físicamente en la caja en ese momento.
4. Ingresá el monto en **Saldo de apertura**.
   - La plataforma te sugiere un valor (el saldo real del último cierre o el saldo inicial de la caja). Podés aceptar la sugerencia o cambiarla si contaste distinto.
5. **Abrir caja**.

La caja pasa a estado **Abierta** y ya podés recibir cobros y registrar gastos.

Importante: el saldo declarado al abrir es la **base del cuadre** al cerrar. Si declarás $50.000 al abrir y registrás $200.000 de ingresos sin gastos, el cierre debería contar $250.000 físicos.
    `,
    relatedIds: ['cerrar-caja', 'caja-conceptos'],
  },
  {
    id: 'cerrar-caja',
    title: 'Cómo cierro una caja con arqueo',
    category: 'cobros',
    keywords: ['arqueo', 'cuadre', 'cierre', 'fin de día', 'diferencia'],
    body: `
1. En la pantalla de detalle de la caja, click en **Cerrar caja** (arriba a la derecha, color negro).
2. Vas a ver un resumen:
   - Saldo de apertura
   - + Ingresos de la sesión
   - − Egresos de la sesión
   - = **Saldo esperado en caja**
3. **Contá el efectivo físico** y escribilo en **Conteo real**.
4. La plataforma calcula la **diferencia**:
   - **0**: cuadre exacto ✓
   - **+**: sobrante (hay más efectivo del esperado)
   - **−**: faltante (hay menos)
5. (Opcional) Agregá una **observación** justificando la diferencia.
6. **Cerrar y generar reporte**.

Se abre un **reporte imprimible** en una nueva pestaña con todo el detalle de la sesión cerrada.

La caja pasa a estado **Cerrada** y deja de recibir movimientos. Para usarla de nuevo, abrila con el botón **Abrir caja**.
    `,
    relatedIds: ['abrir-caja', 'reporte-caja', 'caja-conceptos'],
  },
  {
    id: 'registrar-cobro',
    title: 'Cómo registro un cobro a un paciente',
    category: 'cobros',
    keywords: ['recaudar', 'pago', 'cobrar', 'recibir dinero', 'facturar'],
    body: `
**Opción 1: desde la ficha del paciente (recomendada).**

1. Buscá al paciente.
2. Tab **Recibir pago**.
3. Elegí entre:
   - **Tratamientos completados**: lista los tratamientos del paciente que estén en estado COMPLETADO y aún no cobrados. Tildá los que estás cobrando.
   - **Abono libre**: si no hay tratamientos pendientes o querés recaudar un monto custom, ingresá concepto y monto.
4. Elegí **caja** (debe estar abierta), **medio de pago** y **cajero/recibió**.
5. **Registrar cobro**.

**Opción 2: desde el módulo Cobros general.**

1. **Cobros** → **+ Nuevo cobro**.
2. Buscá al paciente.
3. Resto igual.

Importante: solo usuarios con permiso **"Recibir pagos"** pueden recaudar.
    `,
    relatedIds: ['abono-libre', 'medios-pago', 'permisos-cobros'],
  },
  {
    id: 'abono-libre',
    title: 'Cómo registro un abono libre',
    category: 'cobros',
    keywords: ['abono', 'adelanto', 'monto custom', 'sin tratamiento'],
    body: `
Un abono libre sirve cuando querés recaudar un monto sin asociarlo a un tratamiento específico. Por ejemplo, un anticipo o un saldo a cuenta.

1. Ficha del paciente → **Recibir pago**.
2. Tocá el toggle **Abono libre** (por defecto está en "Tratamientos completados").
3. Escribí un **concepto** (ej. "Abono inicial", "Saldo pendiente").
4. Ingresá el **monto**.
5. Elegí caja, medio de pago y cajero.
6. **Registrar cobro**.

El cobro queda registrado en la facturación del paciente, pero no se asocia a ningún tratamiento. Útil para llevar control sin forzar un match con un tratamiento existente.
    `,
    relatedIds: ['registrar-cobro'],
  },
  {
    id: 'registrar-gasto',
    title: 'Cómo registro un gasto en caja',
    category: 'cobros',
    keywords: ['egreso', 'gasto', 'salida', 'pagar cuenta'],
    body: `
1. Andá a la caja (Cobros → Caja → click en la caja).
2. Botón **Registrar gasto** (rojo, arriba a la derecha).
3. Ingresá:
   - **Monto** (CLP).
   - **Descripción** (ej. "Compra de insumos en farmacia X").
   - **Categoría**: Arriendo, Insumos, Sueldos, Servicios, Retiro, Otro.
   - **Fecha** (por defecto hoy).
4. **Registrar gasto**.

El gasto queda como un **EGRESO** en la caja, restando del saldo esperado. Aparece en la tabla de movimientos y en el reporte de cierre.
    `,
    relatedIds: ['anular-movimiento', 'cerrar-caja'],
  },
  {
    id: 'anular-cobro',
    title: 'Cómo anulo un cobro',
    category: 'cobros',
    keywords: ['anular pago', 'revertir', 'cancelar cobro', 'devolver'],
    body: `
1. Buscá el cobro a anular (en **Cobros** o en la ficha del paciente).
2. Botón **Anular**.
3. Es **obligatorio** indicar un **motivo** de al menos 4 caracteres (ej. "Pago duplicado", "Devolución al paciente", "Error de monto").
4. Confirmar.

El cobro queda con estado ANULADO, se marca con el motivo, tu nombre y la fecha. **El movimiento asociado en caja también se anula automáticamente** — no descuadra.

Para anular cobros necesitás el permiso **"Editar pagos"**.

⚠ Una vez anulado no se "des-anula". Hay que crear un cobro nuevo si era un error.
    `,
    relatedIds: ['editar-cobro', 'permisos-cobros'],
  },
  {
    id: 'editar-cobro',
    title: 'Cómo edito un cobro existente',
    category: 'cobros',
    keywords: ['modificar pago', 'corregir cobro', 'cambiar monto'],
    body: `
1. En Cobros → click en **Editar** del cobro.
2. Modificá lo que necesites:
   - Estado, medio de pago, método (sin permisos especiales).
   - Monto, concepto, fecha de pago, cajero (necesitás permiso **"Editar pagos"**).
3. **Guardar**.

Los cambios quedan reflejados, pero la operación NO genera nuevo movimiento de caja — el monto original ya está registrado. Si el monto cambió, considerá anular el cobro y crear uno nuevo para mantener la trazabilidad.

No se pueden editar cobros que ya están **anulados**.
    `,
    relatedIds: ['anular-cobro', 'permisos-cobros'],
  },
  {
    id: 'anular-movimiento',
    title: 'Cómo anulo un movimiento de caja (gasto, ingreso manual)',
    category: 'cobros',
    keywords: ['anular gasto', 'revertir egreso', 'eliminar movimiento'],
    body: `
1. En el detalle de la caja, ubicá el movimiento en la tabla.
2. Botón **Anular** (solo aparece si tenés permiso).
3. Ingresá un **motivo** (≥4 caracteres).
4. Confirmar.

El movimiento queda tachado en gris con el motivo. NO se borra de la base — queda en el historial con tu nombre y fecha de anulación.

Esto **descuadra el saldo esperado** de la sesión actual hasta el cierre. Es esperable.
    `,
  },
  {
    id: 'reporte-caja',
    title: 'Cómo veo o imprimo el reporte de una caja',
    category: 'cobros',
    keywords: ['comprobante', 'imprimir caja', 'reporte cierre', 'pdf'],
    body: `
**Para una sesión cerrada:**
1. **Cobros → Caja → click en la caja**.
2. Bajá al **Historial de cierres**.
3. Click en **Imprimir** del cierre que quieras → se abre el reporte en una pestaña nueva, listo para imprimir o guardar como PDF.

**Para ver el detalle navegable (sin imprimir):**
- Botón **Detalle** en la misma fila → abre la página de la sesión cerrada con todos los movimientos, cuadre, ingresos por medio de pago, egresos por categoría.

El reporte incluye:
- Datos de la clínica.
- Período de la sesión.
- Cuadre completo (esperado vs. real, diferencia).
- Ingresos por medio de pago.
- Egresos por categoría.
- Detalle de cada movimiento.
- Espacio para firmas.
    `,
    relatedIds: ['cerrar-caja'],
  },
  {
    id: 'medios-pago',
    title: 'Cómo configuro los medios de pago',
    category: 'cobros',
    keywords: ['débito', 'crédito', 'transferencia', 'efectivo', 'webpay', 'comisión'],
    body: `
**Solo admin.**

1. **Configuración** → sección **Medios de pago**.
2. Click en **+ Nuevo medio de pago**.
3. Ingresá:
   - **Nombre** (ej. "Efectivo", "Débito", "Transferencia").
   - **Comisión (%)**: porcentaje que descuenta el medio (ej. 1.5 para crédito 1.5%). Usá 0 si no tiene comisión (ej. efectivo).
4. **Crear**.

Para **editar** un medio: click en el botón de lápiz.
Para **desactivar**: click en el botón de ojo (no aparece más al cobrar, pero los cobros anteriores siguen mostrándolo).

⚠ La comisión se descuenta automáticamente: si cobrás $100.000 con un medio del 3%, el saldo neto a la caja es $97.000 y la diferencia ($3.000) queda registrada como comisión.
    `,
  },
  {
    id: 'permisos-cobros',
    title: 'Permisos de cobros y caja',
    category: 'cobros',
    keywords: ['recibir pagos', 'editar pagos', 'cajero', 'permisos cobros'],
    body: `
Hay 2 permisos relacionados con cobros y caja, en **Equipo** → usuario:

- **Recibir pagos**: habilita al usuario para registrar cobros desde la ficha del paciente y desde el módulo Cobros, y para registrar gastos en caja. Sin este permiso, los botones aparecen deshabilitados.
- **Editar pagos**: habilita para anular cobros y movimientos, y para editar campos privilegiados (monto, fecha de pago, concepto). Es más restrictivo: solo personas de confianza.

**admin** tiene los dos automáticamente. Para asignárselos a otros usuarios, andá a **Equipo** y activá los toggles correspondientes.
    `,
    relatedIds: ['anular-cobro', 'editar-cobro', 'registrar-cobro'],
  },

  // ─── TRATAMIENTOS ────────────────────────────────────────────────────────
  {
    id: 'crear-tratamiento',
    title: 'Cómo agrego un tratamiento a un paciente',
    category: 'tratamientos',
    keywords: ['planificar tratamiento', 'agregar prestación', 'tratamiento nuevo'],
    body: `
1. Ficha del paciente → tab **Tratamientos** o **Plan de tratamiento**.
2. Click en **+ Agregar tratamiento**.
3. Seleccioná la **prestación** del arancel (caries, profilaxis, endodoncia, etc.) — buscá por nombre.
4. El precio se autocompleta del arancel. Si tenés permiso **"Modificar precio"**, podés cambiarlo.
5. (Opcional) **Descuento**: si tenés permiso **"Aplicar descuento"**.
6. (Opcional) **Diente / cara**: marcá el diente/cara afectada.
7. Elegí el **doctor** que lo realizará.
8. **Guardar**.

El tratamiento queda en estado **PLANIFICADO**. Para marcarlo como hecho, cambiá a **COMPLETADO**.
    `,
    relatedIds: ['completar-tratamiento', 'plan-tratamiento'],
  },
  {
    id: 'completar-tratamiento',
    title: 'Cómo marco un tratamiento como completado',
    category: 'tratamientos',
    keywords: ['terminar tratamiento', 'realizar', 'finalizar', 'hecho'],
    body: `
1. Ficha del paciente → tab **Tratamientos**.
2. Buscá el tratamiento en estado PLANIFICADO.
3. Click en el estado y cambiá a **COMPLETADO**.
4. Se setea la fecha de hoy como fecha de completado.

Una vez completado:
- Aparece como cobrable en **Recibir pago** del paciente.
- Cuenta para la liquidación del doctor.

Para **revertir** un tratamiento completado a planificado, necesitás el permiso **"Revertir completado"**.
    `,
    relatedIds: ['registrar-cobro', 'crear-tratamiento'],
  },
  {
    id: 'plan-tratamiento',
    title: 'Cómo armo un plan de tratamiento por secciones',
    category: 'tratamientos',
    keywords: ['plan', 'secciones', 'fases', 'etapas tratamiento'],
    body: `
El plan de tratamiento es una organización de tratamientos en **secciones** (fases). Útil para tratamientos largos como ortodoncia o rehabilitaciones.

1. Ficha del paciente → tab **Plan de tratamiento**.
2. Si no hay plan, **Crear plan**. Le ponés nombre y doctor titular.
3. Dentro del plan, **+ Agregar sección** (ej. "Fase 1: limpiezas", "Fase 2: endodoncias").
4. Dentro de cada sección, agregá los tratamientos.
5. Podés reordenar secciones y mover tratamientos entre ellas.

El plan se imprime con un odontograma y la planificación completa. Útil para presentar al paciente.
    `,
    relatedIds: ['crear-tratamiento'],
  },

  // ─── PRESUPUESTOS ────────────────────────────────────────────────────────
  {
    id: 'crear-presupuesto',
    title: 'Cómo armo un presupuesto',
    category: 'presupuestos',
    keywords: ['cotización', 'cotizar', 'presupuestar'],
    body: `
1. **Presupuestos** → **+ Nuevo presupuesto**.
2. Elegí el **paciente**.
3. Agregá los **items**: prestaciones del arancel con cantidad y precio.
4. (Opcional) Aplicá un **descuento global** al final.
5. Definí la **vigencia** del presupuesto (ej. 30 días).
6. **Guardar**.

El presupuesto queda con un **número correlativo** propio de tu clínica. Aparece en el listado.
    `,
    relatedIds: ['imprimir-presupuesto', 'convertir-presupuesto'],
  },
  {
    id: 'imprimir-presupuesto',
    title: 'Cómo imprimo un presupuesto',
    category: 'presupuestos',
    keywords: ['pdf presupuesto', 'imprimir', 'exportar cotización'],
    body: `
1. Andá al presupuesto (en el listado de **Presupuestos** o en la ficha del paciente).
2. Botón **Imprimir** (icono de impresora).
3. Se abre en una pestaña nueva con el layout listo para imprimir o guardar como PDF (Ctrl+P → Guardar como PDF).

El layout incluye:
- Header con datos de la clínica y logo.
- Datos del paciente.
- Items con detalle.
- Subtotal, descuento, total.
- Vigencia.
    `,
  },
  {
    id: 'convertir-presupuesto',
    title: 'Cómo convierto un presupuesto en tratamientos',
    category: 'presupuestos',
    keywords: ['aceptar presupuesto', 'pasar a tratamientos', 'aprobar'],
    body: `
Cuando el paciente acepta un presupuesto, podés convertirlo en tratamientos planificados de un solo paso:

1. Abrí el presupuesto.
2. Botón **Convertir a tratamientos**.
3. Confirmá.

Se crean automáticamente los tratamientos correspondientes en estado **PLANIFICADO**, listos para ir completando a medida que se realicen.
    `,
    relatedIds: ['crear-tratamiento'],
  },

  // ─── LIQUIDACIONES ───────────────────────────────────────────────────────
  {
    id: 'generar-liquidacion',
    title: 'Cómo genero la liquidación de un doctor',
    category: 'liquidaciones',
    keywords: ['honorarios', 'pagar doctor', 'comisión doctor', 'sueldo'],
    body: `
**Solo admin o usuarios con permiso "Gestionar liquidaciones".**

1. **Liquidaciones** → **+ Generar liquidación**.
2. Elegí el **doctor**.
3. Elegí el **mes** y **año** del período.
4. **Generar**.

La plataforma toma todos los **tratamientos COMPLETADOS del doctor en ese período** que no estén ya en otra liquidación, aplica las reglas del **contrato activo** y arma los items.

Reglas según contrato:
- **Porcentaje (ej. 40%)**: cada tratamiento liquida = precio × 40%.
- **Monto fijo**: cada tratamiento liquida un monto fijo independiente del precio.

La liquidación queda en estado **BORRADOR**. Después la aprobás y la pagás.
    `,
    relatedIds: ['contrato-doctor', 'aprobar-liquidacion', 'mis-liquidaciones'],
  },
  {
    id: 'aprobar-liquidacion',
    title: 'Cómo apruebo y marco como pagada una liquidación',
    category: 'liquidaciones',
    keywords: ['aprobar', 'pagar liquidación', 'estado'],
    body: `
La liquidación tiene 3 estados:

1. **BORRADOR**: recién generada. Revisala y si está OK, click en **Aprobar** → pasa a APROBADA.
2. **APROBADA**: lista para pagar. Cuando le pagás efectivamente al doctor, click en **Marcar pagada** → pasa a PAGADA con la fecha de hoy.
3. **PAGADA**: ya cerrada. Aparece en el historial del doctor.

Los doctores pueden ver sus liquidaciones (todas) pero solo el admin/gestor puede cambiar el estado.
    `,
    relatedIds: ['generar-liquidacion', 'imprimir-liquidacion'],
  },
  {
    id: 'mis-liquidaciones',
    title: 'Cómo veo mis liquidaciones (soy doctor)',
    category: 'liquidaciones',
    keywords: ['mis honorarios', 'cuánto me pagan', 'ver mi liquidación', 'doctor liquidación'],
    body: `
Como doctor común, andá a **Liquidaciones**. Vas a ver:

- **Pendientes de pago**: tus liquidaciones BORRADOR y APROBADAS, en cards con el detalle.
- **Pagadas**: historial de las que ya cobraste.

Click en **Ver detalle** de cualquier liquidación para ver los tratamientos incluidos y el cálculo del honorario.

⚠ Solo ves tus propias liquidaciones. No las de otros doctores.
    `,
    relatedIds: ['imprimir-liquidacion'],
  },
  {
    id: 'imprimir-liquidacion',
    title: 'Cómo imprimo una liquidación',
    category: 'liquidaciones',
    keywords: ['pdf liquidación', 'comprobante'],
    body: `
1. En **Liquidaciones**, ubicá la liquidación.
2. Botón **Imprimir** (icono).
3. Se abre en una pestaña con el layout listo para PDF.

El reporte incluye:
- Datos del doctor y la clínica.
- Período.
- Detalle de cada tratamiento (fecha, paciente, prestación, precio, honorario).
- Total bruto, total honorarios.
- Espacio para firmas.

Útil para entregar como comprobante de pago al doctor.
    `,
  },
  {
    id: 'contrato-doctor',
    title: 'Cómo configuro el contrato de un doctor',
    category: 'liquidaciones',
    keywords: ['contrato', 'porcentaje', 'monto fijo', 'comisión doctor'],
    body: `
**Solo admin.**

1. **Equipo** → click en el botón de contrato del doctor.
2. Click en **+ Nuevo contrato** (si ya tiene uno activo, el nuevo lo reemplaza automáticamente).
3. Elegí el **tipo**:
   - **PORCENTAJE**: % sobre el precio de cada tratamiento (ej. 40%).
   - **MONTO_FIJO**: cantidad fija en CLP por cada tratamiento (ej. $10.000).
4. Definí la fecha de inicio y, opcionalmente, fecha de fin.
5. **Guardar**.

El contrato anterior se desactiva, pero las liquidaciones previas quedan con la regla que tenían en su momento (no recalculan retroactivamente).
    `,
    relatedIds: ['generar-liquidacion'],
  },

  // ─── EQUIPO ──────────────────────────────────────────────────────────────
  {
    id: 'crear-usuario',
    title: 'Cómo creo un usuario nuevo',
    category: 'equipo',
    keywords: ['agregar usuario', 'alta usuario', 'nuevo empleado'],
    body: `
**Solo admin.**

1. **Equipo** → **+ Nuevo usuario**.
2. Ingresá:
   - **Nombre** completo.
   - **Usuario** (login).
   - (Opcional) **Email**.
   - **Rol**: admin, doctor, médico, staff.
   - **RUT** (Chile), **especialidad** (para doctores), **teléfono**.
   - **Contraseña** inicial (al menos 6 caracteres).
3. **Crear**.

El usuario va a entrar con la contraseña que le diste; en su primer login tiene que cambiarla.

Después de crear, asigná permisos específicos según el rol (recibir pagos, editar pagos, etc.) — ver **Permisos**.
    `,
    relatedIds: ['editar-permisos-usuario', 'contrato-doctor', 'configurar-horario-doctor'],
  },
  {
    id: 'editar-permisos-usuario',
    title: 'Cómo cambio los permisos de un usuario',
    category: 'equipo',
    keywords: ['permisos', 'habilitar', 'autorizar', 'toggles'],
    body: `
**Solo admin.**

En **Equipo**, cada usuario tiene una fila con varios toggles (pequeños switches):

- **Pagos**: puede recibir pagos.
- **Editar pagos**: puede anular y editar cobros.
- **Precio**: puede modificar el precio de un tratamiento.
- **Desc.**: puede aplicar descuentos.
- **Revertir**: puede revertir tratamientos completados.
- **Liquidac.**: puede gestionar liquidaciones de cualquier doctor.

Click en cada toggle para activar/desactivar. El cambio es instantáneo.

**admin** tiene todos los permisos siempre, no necesitás activarlos uno por uno.
    `,
    relatedIds: ['crear-usuario'],
  },
  {
    id: 'desactivar-usuario',
    title: 'Cómo doy de baja a un usuario',
    category: 'equipo',
    keywords: ['eliminar usuario', 'baja empleado', 'inactivo'],
    body: `
**Solo admin.**

No se borran usuarios (perderías historial de citas, cobros, etc.). En su lugar se **desactivan**:

1. **Equipo** → click en el icono de bloquear del usuario (ojo tachado o similar).
2. Confirmar.

El usuario queda inactivo:
- No puede loguear.
- No aparece como opción para nuevas citas, cobros, etc.
- Su historial queda intacto.

Podés reactivarlo en cualquier momento haciendo click de nuevo.
    `,
  },

  // ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────
  {
    id: 'google-conectar',
    title: 'Cómo conecto Google Calendar a la clínica',
    category: 'google',
    keywords: ['conectar google', 'sincronizar calendar', 'oauth', 'cuenta google'],
    body: `
**Solo admin.**

1. **Configuración** → sección **Google Calendar** → botón **Conectar Google**.
2. Te redirige al login de Google. Iniciá sesión con la **cuenta de Google de la clínica** (no la personal).
3. Acepta los permisos (acceso a calendarios + email).
4. Volvés a la plataforma con un banner verde "Google Calendar conectado correctamente".

Una sola cuenta de Google por clínica, que contiene varios calendarios (uno por dentista).

Después de conectar, asigná a cada dentista su calendario respectivo en **Equipo** → sección **Sincronización con Google Calendar**.
    `,
    relatedIds: ['google-asignar-calendar', 'google-desconectar', 'google-sync-funcionamiento'],
  },
  {
    id: 'google-asignar-calendar',
    title: 'Cómo asigno un calendario de Google a un dentista',
    category: 'google',
    keywords: ['mapear', 'asignar calendar', 'doctor calendar', 'sincronizar doctor'],
    body: `
**Solo admin. Requiere haber conectado Google previamente.**

1. **Equipo** → arriba vas a ver la sección **Sincronización con Google Calendar**.
2. Click en **Cargar calendarios** (solo la primera vez, trae los calendarios disponibles de la cuenta conectada).
3. Para cada dentista, elegí del dropdown el calendario que le corresponde.
4. La asignación se guarda al instante.

Al asignar por primera vez, se dispara un **import inicial** que trae los eventos futuros del calendario al sistema. Las citas que ya existían en Google aparecen en Cláriva como:
- **Citas reales** si el título del evento matchea un paciente activo (un nombre + apellido único).
- **Bloqueos** si no se puede identificar paciente.
    `,
    relatedIds: ['google-conectar', 'google-convertir-bloqueos', 'google-sync-funcionamiento'],
  },
  {
    id: 'google-sync-funcionamiento',
    title: 'Cómo funciona la sincronización con Google',
    category: 'google',
    keywords: ['sincronizar', 'sync', 'bidireccional', 'cómo funciona google'],
    body: `
**Hacia Google (push):** cuando creás, editás o cancelás una cita o bloqueo en Cláriva, el cambio aparece en Google Calendar del dentista en segundos.

**Desde Google (pull):** cada 5 minutos un cron busca cambios en los calendarios de Google y los trae a Cláriva. Si alguien crea un evento manualmente en Google:
- Si el título matchea un paciente activo → cita real.
- Si no → bloqueo de agenda.

**Conflictos**: si un evento se edita simultáneamente en Cláriva y Google, **Cláriva gana**. Es decir, la próxima sincronización sobrescribe el cambio de Google con la versión de Cláriva. La plataforma es la fuente de verdad.

**Si querés forzar un sync ahora** (no esperar los 5 minutos): **Equipo** → botón **Sincronizar ahora**. Tarda unos segundos.
    `,
    relatedIds: ['google-convertir-bloqueos', 'google-conectar'],
  },
  {
    id: 'google-convertir-bloqueos',
    title: 'Cómo convierto bloqueos importados de Google en citas',
    category: 'google',
    keywords: ['migración dentalink', 'importar citas', 'bloqueos a citas'],
    body: `
Cuando hacés la primera sincronización con Google, las citas que vienen de un sistema externo (ej. Dentalink) entran como **bloqueos** si el matching de paciente no es 100% claro.

Para promoverlos a citas reales (después de cargar tus pacientes):

1. **Equipo** → botón **Convertir bloqueos a citas** (al lado de "Sincronizar ahora").
2. Confirmá.
3. La plataforma recorre todos los bloqueos importados de Google, intenta hacer matching con los pacientes activos por nombre + apellido (único) y convierte los que matchen en citas reales.
4. Te muestra el resumen: "**X de Y bloqueos convertidos**". Los que no se convirtieron es porque el título no coincide con ningún paciente o coincide con varios (ambigüedad).

Los bloqueos NO convertidos siguen siendo bloqueos válidos (eventos genuinos del dentista: reuniones, capacitaciones, etc.).
    `,
    relatedIds: ['google-asignar-calendar', 'google-sync-funcionamiento'],
  },
  {
    id: 'google-desconectar',
    title: 'Cómo desconecto Google Calendar',
    category: 'google',
    keywords: ['desconectar google', 'revocar acceso', 'quitar sincronización'],
    body: `
**Solo admin.**

1. **Configuración** → sección **Google Calendar** → botón **Desconectar**.
2. Confirmá.

Qué pasa:
- Los tokens se revocan en Google (la plataforma ya no puede acceder).
- Se limpia la asignación de calendarios de todos los dentistas.
- Las citas y bloqueos quedan en Cláriva (no se borran), pero dejan de sincronizar.
- Los eventos en Google que ya estaban creados permanecen ahí (no los borramos).

Para reconectar después: botón **Conectar Google** otra vez. Hay que volver a asignar calendarios a los dentistas (no recuerda la asignación anterior).
    `,
    relatedIds: ['google-conectar'],
  },

  // ─── CONFIGURACIÓN ───────────────────────────────────────────────────────
  {
    id: 'datos-clinica',
    title: 'Cómo edito los datos de mi clínica',
    category: 'configuracion',
    keywords: ['nombre clínica', 'dirección', 'teléfono', 'datos'],
    body: `
**Solo admin.**

1. **Configuración**.
2. Editá: nombre, dirección, ciudad, teléfono, email, RUT.
3. **Guardar**.

Estos datos aparecen en:
- Reportes imprimibles (presupuestos, cierres de caja, liquidaciones).
- Mensajes de WhatsApp de confirmación.
- Header de la plataforma.
    `,
    relatedIds: ['subir-logo', 'plantilla-whatsapp'],
  },
  {
    id: 'subir-logo',
    title: 'Cómo subo el logo de mi clínica',
    category: 'configuracion',
    keywords: ['logotipo', 'imagen marca', 'logo'],
    body: `
**Solo admin.**

1. **Configuración** → sección Logo.
2. Click en **Subir logo**.
3. Elegí un archivo de imagen (PNG, JPG; máximo 100 KB recomendado).
4. **Guardar**.

El logo aparece en todos los reportes imprimibles y en el header de la plataforma. Sugerencia: imagen cuadrada o ligeramente apaisada, fondo transparente (PNG).
    `,
    relatedIds: ['datos-clinica'],
  },
  {
    id: 'plantilla-whatsapp',
    title: 'Cómo personalizo el mensaje de WhatsApp',
    category: 'configuracion',
    keywords: ['mensaje wa', 'plantilla mensaje', 'confirmar cita texto'],
    body: `
**Solo admin.**

1. **Configuración** → sección **Mensaje de WhatsApp**.
2. Editá el texto. Podés usar estas variables que se reemplazan automáticamente al enviar:
   - \`{nombre}\` → primer nombre del paciente.
   - \`{clinica}\` → nombre de tu clínica.
   - \`{fecha}\` → fecha y hora de la cita formateada (ej. "martes 10 de junio a las 10:30 hrs").
   - \`{direccion}\` → dirección + ciudad de la clínica.
3. **Guardar**.

Ejemplo: \`Hola {nombre}, te escribimos de *{clinica}* para confirmar tu cita el {fecha} en {direccion}.\`

Cada vez que confirmes una cita por WhatsApp se usa esta plantilla con los datos del paciente.
    `,
    relatedIds: ['confirmar-whatsapp'],
  },

  // ─── PROBLEMAS COMUNES ───────────────────────────────────────────────────
  {
    id: 'problema-no-cobrar',
    title: 'No me deja registrar un cobro',
    category: 'problemas',
    keywords: ['error cobro', 'no recauda', 'bloqueado cobrar'],
    body: `
Las causas más comunes:

1. **No tenés el permiso "Recibir pagos"**. Pedile al admin que lo active en Equipo.
2. **No hay cajas con sesión abierta**. Andá a **Cobros → Caja** y **abrí** una caja con el saldo declarado.
3. **El paciente no tiene tratamientos completados** (si estás en modo Tratamientos). Solucioná con uno de los dos:
   - Marcá un tratamiento como COMPLETADO primero.
   - Usá modo **Abono libre** y escribí concepto + monto a recaudar.

Si después de revisar los 3 puntos sigue fallando, capturá la pantalla del error y contactá soporte.
    `,
    relatedIds: ['registrar-cobro', 'abrir-caja', 'permisos-cobros'],
  },
  {
    id: 'problema-no-veo-paciente',
    title: 'No encuentro un paciente que existe',
    category: 'problemas',
    keywords: ['paciente desaparecido', 'no aparece', 'buscador no encuentra'],
    body: `
Razones:

1. **Está desactivado**. Andá a **Pacientes** → activá el filtro "Mostrar inactivos" (si existe) o pedile al admin que lo reactive desde su ficha.
2. **Buscaste mal** (típico con apellidos compuestos). Probá con apellido solo, o con RUT.
3. **Es de otra clínica** (si tu cuenta tiene acceso a varias por error). Verificá el subdominio en la URL del browser.

Si seguís sin encontrarlo y estás seguro de que debería estar: capturá pantalla del buscador con tu búsqueda y contactá soporte.
    `,
    relatedIds: ['buscar-paciente'],
  },
  {
    id: 'problema-cita-no-en-google',
    title: 'Una cita no aparece en Google Calendar',
    category: 'problemas',
    keywords: ['no sincroniza', 'cita falta en google', 'sync no funciona'],
    body: `
Verificá en este orden:

1. **¿La clínica está conectada a Google?** **Configuración** → sección Google Calendar debería mostrar "Conectado" con la cuenta.
2. **¿El doctor de la cita tiene calendario asignado?** **Equipo** → sección sincronización → verificá que el doctor tenga un calendario en su dropdown (no "Sin sincronizar").
3. **¿Pasó suficiente tiempo?** El push es casi instantáneo, pero a veces tarda 30-60 seg.
4. **¿Estás mirando el calendario correcto en Google?** Si el doctor está mapeado a "Calendario Doctor X", la cita aparece ahí, no en el calendario principal.

Si después de esto la cita no está, andá a Equipo → **Sincronizar ahora** para forzar el push. Si sigue sin aparecer, contactá soporte con el ID de la cita.
    `,
    relatedIds: ['google-conectar', 'google-asignar-calendar', 'google-sync-funcionamiento'],
  },
  {
    id: 'problema-caja-descuadrada',
    title: 'La caja me da diferencia al cerrar (sobrante o faltante)',
    category: 'problemas',
    keywords: ['descuadre', 'falta dinero', 'sobra dinero', 'diferencia cierre'],
    body: `
Si al cerrar la caja la diferencia no es cero, no entres en pánico — es la situación más común:

**Faltante (cuenta menos del esperado):**
- ¿Hay un cobro que registraste pero el cliente no pagó? Anulalo.
- ¿Se entregó vuelto de más?
- ¿Algún gasto efectivo que no quedó registrado? Registralo como gasto y reabrí el conteo.

**Sobrante (cuenta más del esperado):**
- ¿Hay un cobro que se realizó pero no se registró en el sistema? Registralo (idealmente antes de cerrar).
- ¿Sobró vuelto?

En cualquier caso:
1. Cerrá la caja con el conteo REAL que tenés (no "ajustes para que dé cero").
2. Anotá la diferencia en **Observaciones** con la razón identificada o "diferencia sin justificar".
3. La diferencia queda en el reporte de cierre para auditoría.

Mejor cerrar honestamente con diferencia que falsear el conteo.
    `,
    relatedIds: ['cerrar-caja', 'anular-cobro'],
  },
  {
    id: 'problema-bloqueo-no-deja-agendar',
    title: 'No me deja agendar porque dice que hay un bloqueo',
    category: 'problemas',
    keywords: ['bloqueo agenda', 'no permite cita', 'error 409', 'doctor no disponible'],
    body: `
Cuando intentás agendar una cita en un horario donde el doctor tiene un bloqueo, la plataforma te responde con un error tipo "El doctor tiene un bloqueo de agenda en ese horario".

Soluciones:

1. **Cambiá de horario**: agendá en otro slot libre.
2. **Cambiá de doctor**: si está disponible otro profesional en ese horario.
3. **Eliminá el bloqueo** (si tenés permiso): click en el bloque gris en la agenda → modal → **Eliminar bloqueo**.

Los bloqueos son intencionales (vacaciones, capacitaciones, ausencias) — no son bugs. Si el dentista efectivamente va a estar, alguien marcó por error que no.
    `,
    relatedIds: ['bloquear-horario', 'crear-cita'],
  },
  {
    id: 'problema-no-veo-modulo',
    title: 'No veo un módulo o no me aparece en el menú',
    category: 'problemas',
    keywords: ['módulo oculto', 'no aparece menú', 'sin acceso'],
    body: `
Probable causa: **no tenés el permiso o rol necesario**.

- **Liquidaciones**: como doctor común solo ves las tuyas. Como gestor o admin ves todas.
- **Cobros**: necesitás permiso "Recibir pagos" para registrar; el módulo lo ves siempre.
- **Equipo (Usuarios)**: solo admin.
- **Configuración**: solo admin.

Pedile al admin que active los permisos que necesitás en **Equipo** → tu usuario → toggles.
    `,
    relatedIds: ['mis-permisos', 'editar-permisos-usuario'],
  },
  {
    id: 'problema-soporte',
    title: 'Mi problema no está en la ayuda',
    category: 'problemas',
    keywords: ['contactar soporte', 'ayuda humana', 'ticket'],
    body: `
Si revisaste la ayuda y no encontrás lo que necesitás:

1. **Capturá pantalla** del error o de lo que estás intentando hacer.
2. **Copiá la URL** del browser donde está el problema.
3. **Anotá los pasos** que hiciste antes del error ("1) Entré a X, 2) Hice click en Y, 3) Apareció Z").
4. Contactá al **soporte de Cláriva**.

Vamos a responder lo más rápido posible. Si es algo crítico (la plataforma no funciona), respondemos en horas. Para dudas de uso, dentro de las 24 hs hábiles.
    `,
  },

  // ─── INSTALAR LA APP (PWA) ───────────────────────────────────────────────
  {
    id: 'instalar-app',
    title: 'Cómo instalar Cláriva como app en mi teléfono o PC',
    category: 'empezando',
    keywords: [
      'app', 'aplicacion', 'instalar', 'pantalla inicio', 'icono', 'celular',
      'movil', 'pwa', 'descargar', 'acceso directo', 'sin navegador',
    ],
    body: `
Cláriva se puede usar como **app** en tu teléfono o computador, sin pasar por el navegador. El ícono queda en tu pantalla de inicio y al abrirla se ve en pantalla completa, igual que cualquier app nativa.

No hay que descargar nada de App Store ni Play Store. La app se instala directamente desde tu navegador.

## En iPhone (Safari)

1. Abrí Cláriva en **Safari** (tiene que ser Safari, no Chrome).
2. Tocá el botón **Compartir** (el cuadrado con flecha hacia arriba, abajo en el centro).
3. Bajá en el menú y tocá **Agregar a pantalla de inicio**.
4. Confirmá el nombre **Cláriva** y tocá **Agregar**.
5. El ícono cyan con la "C" queda en tu pantalla. Tocalo y se abre como app.

## En Android (Chrome, Edge, Brave, Samsung Internet)

1. Abrí Cláriva en el navegador.
2. Si te aparece el banner **"Instalar app"** abajo, tocalo y confirmá.
3. Si no te aparece: tocá el menú **⋮** (tres puntos arriba a la derecha) → **Instalar app** o **Agregar a pantalla de inicio**.
4. Confirmá. El ícono queda en tu pantalla de inicio y en el cajón de apps.

## En PC o Mac (Chrome, Edge, Brave)

1. Abrí Cláriva en el navegador.
2. En la barra de direcciones, a la derecha, mirá si aparece un ícono de **monitor con flecha hacia abajo** (instalar). Hacé click.
3. Confirmá **Instalar**.
4. Cláriva se abre en una ventana propia, como una app de escritorio. Aparece en el menú inicio (Windows) o Launchpad (Mac).

## ¿No me aparece la opción de instalar?

- **Firefox** no soporta instalación de apps web (PWA) en móvil. Usá Chrome o Brave.
- **iPhone** solo permite instalar desde Safari. Si estás en Chrome iOS, abrilo en Safari primero.
- Algunos navegadores corporativos bloquean esta función. Probá con Chrome o Edge personal.
    `,
    relatedIds: ['primer-ingreso', 'app-vs-web', 'desinstalar-app'],
  },

  {
    id: 'app-vs-web',
    title: '¿Qué diferencia hay entre usar la app instalada y el navegador?',
    category: 'empezando',
    keywords: ['diferencia', 'app vs web', 'navegador', 'instalada', 'ventajas', 'pwa'],
    body: `
**Es la misma plataforma**. Los datos, la cuenta, todo es exactamente igual. Lo que cambia es la experiencia:

## La app instalada
- Ícono propio en tu pantalla de inicio o escritorio.
- Se abre en pantalla completa, **sin barra de navegador** distrayendo.
- Se siente como una app nativa (incluso aparece en el selector de apps abiertas).
- Carga más rápido la próxima vez (ciertos archivos quedan guardados localmente).

## El navegador
- Funciona exactamente igual, sin instalar nada.
- Útil si entrás desde un computador prestado o un cyber.
- Útil si querés tener varias pestañas con distintas vistas a la vez.

**Recomendación:** si vas a usar Cláriva todos los días, instalá la app. Es más cómodo y rápido. Si entrás esporádicamente o desde computadores ajenos, usá el navegador.

⚠️ La app **no funciona offline**. Necesitás conexión a internet siempre, porque los datos viven en la nube.
    `,
    relatedIds: ['instalar-app', 'desinstalar-app'],
  },

  {
    id: 'desinstalar-app',
    title: 'Cómo desinstalo la app de Cláriva',
    category: 'empezando',
    keywords: ['desinstalar', 'eliminar', 'borrar app', 'quitar', 'remove'],
    body: `
## En iPhone
1. Mantené presionado el ícono de Cláriva en la pantalla de inicio.
2. Tocá **Eliminar app** → **Eliminar de la pantalla de inicio**.

## En Android
1. Mantené presionado el ícono de Cláriva.
2. Arrastralo a **Desinstalar** (arriba) o tocá **Información de la app** → **Desinstalar**.

## En PC o Mac
1. Abrí Cláriva instalada.
2. Hacé click en el menú **⋮** arriba a la derecha de la ventana → **Desinstalar Cláriva**.
3. Confirmá.

Desinstalar la app **no borra tu cuenta**. Tus datos siguen en la nube. Podés volver a entrar desde el navegador o reinstalar la app cuando quieras.
    `,
    relatedIds: ['instalar-app', 'app-vs-web'],
  },
]
