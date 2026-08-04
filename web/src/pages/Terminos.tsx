import { LegalLayout, H2, P, UL } from './LegalLayout'

export function Terminos() {
  return (
    <LegalLayout title="Términos de Servicio" actualizado="4 de agosto de 2026">
      <P>
        Estos Términos de Servicio (“Términos”) regulan el uso de <strong>Cláriva</strong>, la
        plataforma de gestión para clínicas y centros de salud disponible en <strong>clariva.cl</strong>
        y sus subdominios. Al crear una cuenta o usar el servicio, aceptas estos Términos.
      </P>

      <H2>1. El servicio</H2>
      <P>
        Cláriva ofrece herramientas para gestionar agenda, fichas clínicas, presupuestos, cobros,
        comunicaciones e integraciones (como Google Calendar) de una clínica o profesional de salud.
        Podemos mejorar, modificar o discontinuar funciones para mantener y evolucionar el servicio.
      </P>

      <H2>2. Cuentas y responsabilidad del usuario</H2>
      <UL>
        <li>Debes entregar información veraz y mantener la confidencialidad de tus credenciales.</li>
        <li>Eres responsable de la actividad realizada bajo tu cuenta y las de tu equipo.</li>
        <li>La clínica es responsable de los datos de sus pacientes que carga en la plataforma, de
          contar con base legal para tratarlos y de informar a sus pacientes según corresponda.</li>
      </UL>

      <H2>3. Uso aceptable</H2>
      <P>Al usar Cláriva te comprometes a no:</P>
      <UL>
        <li>Usar la plataforma para fines ilícitos o sin autorización sobre los datos que cargas.</li>
        <li>Intentar vulnerar la seguridad, acceder a datos de otras clínicas o interrumpir el servicio.</li>
        <li>Revender o dar acceso al servicio a terceros fuera de tu clínica sin autorización.</li>
      </UL>

      <H2>4. Integraciones de terceros</H2>
      <P>
        Algunas funciones dependen de servicios de terceros (por ejemplo, Google Calendar o el
        proveedor de pagos). Su uso se rige además por los términos y políticas de esos terceros.
        Conectar o desconectar una integración es decisión de la clínica.
      </P>

      <H2>5. Planes y pagos</H2>
      <P>
        El acceso a los planes de pago se factura según el plan contratado. Los precios y condiciones
        vigentes se informan en el sitio o al contratar. La falta de pago puede suspender el acceso a
        las funciones de pago del servicio.
      </P>

      <H2>6. Propiedad</H2>
      <P>
        El software, la marca y los contenidos de Cláriva nos pertenecen. Los datos que la clínica
        carga siguen siendo de la clínica; Cláriva solo los trata para prestar el servicio.
      </P>

      <H2>7. Disponibilidad y garantías</H2>
      <P>
        Trabajamos para ofrecer un servicio estable y con respaldos, pero el servicio se provee “tal
        cual”, sin garantía de disponibilidad ininterrumpida. Recomendamos a cada clínica mantener sus
        propios respaldos de la información crítica cuando corresponda.
      </P>

      <H2>8. Limitación de responsabilidad</H2>
      <P>
        En la medida permitida por la ley, Cláriva no será responsable por daños indirectos o lucro
        cesante derivados del uso o imposibilidad de uso del servicio. Nada en estos Términos limita
        responsabilidades que no puedan excluirse legalmente.
      </P>

      <H2>9. Terminación</H2>
      <P>
        Puedes dejar de usar Cláriva y solicitar la baja de tu cuenta en cualquier momento. Podemos
        suspender o terminar cuentas que incumplan estos Términos.
      </P>

      <H2>10. Ley aplicable</H2>
      <P>
        Estos Términos se rigen por las leyes de la República de Chile, y cualquier controversia se
        someterá a los tribunales competentes de Chile.
      </P>

      <H2>11. Contacto</H2>
      <P>
        Para consultas sobre estos Términos, escribinos a{' '}
        <a className="text-cyan-600 hover:text-cyan-700" href="mailto:soporte@clariva.cl">soporte@clariva.cl</a>.
      </P>
    </LegalLayout>
  )
}
