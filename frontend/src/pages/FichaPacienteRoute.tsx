import { useParams } from 'react-router-dom'
import { FichaPaciente } from '@/pages/FichaPaciente'

// La ficha del paciente tiene decenas de estados locales (incluido el formulario
// editable, que inicializa su estado desde el paciente UNA sola vez). Al navegar de
// un paciente a otro sin recargar, React reutiliza la instancia y esos formularios
// quedan con los datos del paciente anterior — con riesgo de guardarle a B los datos
// de A. La remontamos con key={id}: al cambiar el id, React descarta el subárbol y
// todo el estado nace del paciente nuevo. Es más robusto que confiar en que cada
// useEffect acierte sus dependencias en un archivo enorme. Test: FichaPacienteRoute.test.tsx.
export function FichaPacienteRoute() {
  const { id = '' } = useParams()
  return <FichaPaciente key={id} />
}
