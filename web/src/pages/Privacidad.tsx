import { LegalLayout, H2, P, UL } from './LegalLayout'

export function Privacidad() {
  return (
    <LegalLayout title="Política de Privacidad" actualizado="4 de agosto de 2026">
      <P>
        Esta Política de Privacidad describe cómo <strong>Cláriva</strong> (“Cláriva”, “nosotros”)
        trata la información en relación con la plataforma de gestión para clínicas y centros de
        salud disponible en <strong>clariva.cl</strong> y sus subdominios. Al usar Cláriva aceptas
        las prácticas aquí descritas.
      </P>

      <H2>1. Quiénes somos y qué hacemos</H2>
      <P>
        Cláriva es un software como servicio (SaaS) que las clínicas y profesionales de salud usan
        para gestionar su agenda, fichas de pacientes, presupuestos, cobros y comunicaciones. Cada
        clínica es responsable de los datos de sus pacientes; Cláriva actúa como proveedor
        tecnológico que trata esos datos por cuenta y bajo instrucción de la clínica.
      </P>

      <H2>2. Información que tratamos</H2>
      <UL>
        <li><strong>Datos de la cuenta de la clínica:</strong> nombre de la clínica, datos de sus usuarios (nombre, correo, rol) y credenciales de acceso.</li>
        <li><strong>Datos que la clínica carga:</strong> información de pacientes y de la operación clínica (agenda, fichas, tratamientos, presupuestos, cobros). La clínica decide qué carga.</li>
        <li><strong>Datos técnicos:</strong> registros de acceso y de errores necesarios para operar y asegurar el servicio.</li>
        <li><strong>Datos de integraciones que la clínica elige conectar</strong>, como Google Calendar (ver sección 3).</li>
      </UL>

      <H2>3. Integración con Google (Google Calendar)</H2>
      <P>
        Si una clínica <strong>opta por conectar Google Calendar</strong>, Cláriva accede a datos de
        Google únicamente para prestar la función de sincronización de agenda. Detallamos este uso de
        forma transparente:
      </P>
      <UL>
        <li><strong>Permisos (scopes) solicitados:</strong> ver y editar eventos del calendario
          (<code>calendar.events</code>), listar los calendarios de la cuenta para asignar uno a cada
          profesional (<code>calendar</code>), y el correo de la cuenta conectada
          (<code>userinfo.email</code>, <code>openid</code>) solo para mostrar con qué cuenta quedó
          vinculada la clínica.</li>
        <li><strong>Para qué lo usamos:</strong> sincronizar la agenda en ambas direcciones — crear,
          actualizar y cancelar eventos en el Google Calendar del profesional cuando se agenda o
          modifica una cita en Cláriva, y traer a Cláriva los eventos que el profesional crea
          directamente en Google, para evitar dobles reservas.</li>
        <li><strong>Datos que se escriben en el calendario:</strong> al crear un evento, Cláriva
          incluye la información de la cita (paciente y datos de contacto que la propia clínica cargó)
          en el calendario de la clínica, para su gestión interna.</li>
        <li><strong>Cómo se almacenan las credenciales:</strong> los tokens de acceso de Google se
          guardan <strong>cifrados</strong> (AES-256-GCM) y separados por clínica. No almacenamos tu
          contraseña de Google.</li>
        <li><strong>Uso Limitado:</strong> el uso que Cláriva hace de la información recibida de las
          APIs de Google se ajusta a la <a className="text-cyan-600 hover:text-cyan-700" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Datos de Usuario de los Servicios de las API de Google</a>,
          incluidos sus requisitos de <strong>Uso Limitado (Limited Use)</strong>. En particular:
          <strong> no</strong> vendemos estos datos, <strong>no</strong> los usamos para publicidad,
          <strong> no</strong> los usamos para entrenar modelos de inteligencia artificial, y
          <strong> no</strong> permitimos que personas los lean, salvo con tu consentimiento, para
          soporte, por seguridad o cuando la ley lo exija.</li>
        <li><strong>Revocación:</strong> la clínica puede desconectar Google en cualquier momento desde
          Configuración → Google Calendar. Al hacerlo, Cláriva revoca el token en Google y elimina las
          credenciales almacenadas.</li>
      </UL>

      <H2>4. Cómo protegemos la información</H2>
      <UL>
        <li><strong>Aislamiento por clínica:</strong> los datos de cada clínica viven en una base de
          datos físicamente separada.</li>
        <li><strong>Cifrado:</strong> el tráfico viaja por HTTPS y los secretos sensibles (como los
          tokens de Google) se almacenan cifrados.</li>
        <li><strong>Acceso restringido</strong> y registros de auditoría de las acciones relevantes.</li>
      </UL>

      <H2>5. Con quién compartimos información</H2>
      <P>
        No vendemos datos. Compartimos información solo con proveedores que nos permiten operar el
        servicio, actuando bajo nuestras instrucciones: infraestructura y base de datos (Railway),
        DNS y red (Cloudflare), envío de correos (Resend), procesamiento de pagos (según el proveedor
        habilitado por la clínica) y Google, cuando la clínica conecta su calendario. También podemos
        divulgar información si la ley lo requiere.
      </P>

      <H2>6. Conservación y eliminación</H2>
      <P>
        Conservamos los datos mientras la clínica mantenga su cuenta activa y por el tiempo necesario
        para cumplir obligaciones legales. La clínica puede solicitar la baja de su cuenta y la
        eliminación de sus datos escribiéndonos al correo de contacto. Los tokens de Google se
        eliminan al desconectar la integración.
      </P>

      <H2>7. Tus derechos</H2>
      <P>
        Conforme a la legislación chilena de protección de datos (Ley N° 19.628 y su normativa
        aplicable), puedes solicitar acceder, rectificar, actualizar o eliminar tus datos personales.
        Si sos paciente de una clínica que usa Cláriva, dirigí tu solicitud a la clínica, que es la
        responsable de tus datos; te ayudaremos a canalizarla.
      </P>

      <H2>8. Cambios a esta política</H2>
      <P>
        Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su fecha
        de última actualización.
      </P>

      <H2>9. Contacto</H2>
      <P>
        Ante cualquier consulta sobre privacidad, escribinos a{' '}
        <a className="text-cyan-600 hover:text-cyan-700" href="mailto:soporte@clariva.cl">soporte@clariva.cl</a>.
      </P>
    </LegalLayout>
  )
}
