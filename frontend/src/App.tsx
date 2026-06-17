import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { Login } from '@/pages/Login'
import { Agenda } from '@/pages/Agenda'
import { Pacientes } from '@/pages/Pacientes'
import { FichaPaciente } from '@/pages/FichaPaciente'
import { Equipo } from '@/pages/Equipo'
import { Prestaciones } from '@/pages/Prestaciones'
import { Configuracion } from '@/pages/Configuracion'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/:id" element={<FichaPaciente />} />
            <Route path="/prestaciones" element={<Prestaciones />} />
            <Route path="/equipo" element={<Equipo />} />
            <Route path="/configuracion" element={<Configuracion />} />
          </Route>
          <Route path="*" element={<Navigate to="/agenda" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
