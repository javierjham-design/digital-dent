import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { SuperAdminLayout } from '@/layouts/SuperAdminLayout'
import { Login } from '@/pages/Login'
import { Agenda } from '@/pages/Agenda'
import { Pacientes } from '@/pages/Pacientes'
import { FichaPaciente } from '@/pages/FichaPaciente'
import { Equipo } from '@/pages/Equipo'
import { Prestaciones } from '@/pages/Prestaciones'
import { Configuracion } from '@/pages/Configuracion'
import { Cobros } from '@/pages/Cobros'
import { Liquidaciones } from '@/pages/Liquidaciones'
import { Presupuestos } from '@/pages/Presupuestos'
import { Reportes } from '@/pages/Reportes'
import { AdminDashboard } from '@/pages/admin/Dashboard'
import { AdminClinicas } from '@/pages/admin/Clinicas'
import { AdminClinicaDetalle } from '@/pages/admin/ClinicaDetalle'
import { AdminLeads } from '@/pages/admin/Leads'
import { AdminPlanes } from '@/pages/admin/PlanesSuscripcion'

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
            <Route path="/presupuestos" element={<Presupuestos />} />
            <Route path="/cobros" element={<Cobros />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/liquidaciones" element={<Liquidaciones />} />
            <Route path="/prestaciones" element={<Prestaciones />} />
            <Route path="/equipo" element={<Equipo />} />
            <Route path="/configuracion" element={<Configuracion />} />
          </Route>
          <Route path="/plataforma" element={<SuperAdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="clinicas" element={<AdminClinicas />} />
            <Route path="clinicas/:id" element={<AdminClinicaDetalle />} />
            <Route path="leads" element={<AdminLeads />} />
            <Route path="planes" element={<AdminPlanes />} />
          </Route>
          <Route path="*" element={<Navigate to="/agenda" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
