import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { FichaPacienteRoute } from '@/pages/FichaPacienteRoute'

// Reemplazamos la ficha real (2.5k líneas, decenas de servicios) por una sonda que
// reproduce el patrón del bug: captura el id en estado local UNA sola vez, al montar
// (como el formulario editable que inicializa sus campos desde el paciente). Si el
// remonte por key funciona, al cambiar de paciente la sonda muestra el id NUEVO; si
// se rompiera (React reutiliza la instancia), mostraría el id VIEJO.
vi.mock('@/pages/FichaPaciente', async () => {
  const { useState } = await import('react')
  const { useParams } = await import('react-router-dom')
  return {
    FichaPaciente: function FichaPacienteSonda() {
      const { id = '' } = useParams()
      const [capturadoAlMontar] = useState(id)
      return <div data-testid="campo">{capturadoAlMontar}</div>
    },
  }
})

function Harness() {
  const nav = useNavigate()
  return (
    <>
      <button onClick={() => nav('/pacientes/B')}>ir a B</button>
      <Routes>
        <Route path="/pacientes/:id" element={<FichaPacienteRoute />} />
      </Routes>
    </>
  )
}

describe('FichaPacienteRoute', () => {
  it('remonta al cambiar de paciente: los campos son del paciente nuevo, no del anterior', () => {
    render(
      <MemoryRouter initialEntries={['/pacientes/A']}>
        <Harness />
      </MemoryRouter>,
    )
    // Monta con el paciente A → el campo (estado local capturado al montar) es "A".
    expect(screen.getByTestId('campo').textContent).toBe('A')

    // Navego a B sin recargar. Con key={id} la sonda se remonta y captura "B".
    fireEvent.click(screen.getByText('ir a B'))
    expect(screen.getByTestId('campo').textContent).toBe('B')
  })
})
