import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PacienteDTO, ClinicaConfigDTO } from '@shared/types'
import { planesService } from '@/services/clinico.service'
import { pacientesService } from '@/services/clinica.service'
import { clinicaService } from '@/services/catalogo.service'
import { PresupuestoPlanDoc, type PPlan } from '@/components/PresupuestoPlanDoc'

export function PlanPrint() {
  const { id = '' } = useParams()
  const [plan, setPlan] = useState<PPlan | null>(null)
  const [clinica, setClinica] = useState<ClinicaConfigDTO | null>(null)
  const [paciente, setPaciente] = useState<PacienteDTO | null>(null)

  useEffect(() => {
    planesService.obtener(id).then((p) => {
      const pp = p as PPlan
      setPlan(pp)
      if (pp.pacienteId) pacientesService.obtener(pp.pacienteId).then(setPaciente).catch(() => {})
    }).catch(() => {})
    clinicaService.obtener().then(setClinica).catch(() => {})
  }, [id])

  const listo = Boolean(plan && clinica)
  useEffect(() => {
    if (!listo) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [listo])

  if (!plan || !clinica) return <p className="p-8 text-slate-500 text-sm">Generando presupuesto…</p>

  return (
    <div className="min-h-screen bg-white text-slate-800 p-8 max-w-3xl mx-auto print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg">Imprimir / Guardar PDF</button>
      </div>
      <PresupuestoPlanDoc plan={plan} clinica={clinica} paciente={paciente} />
    </div>
  )
}
