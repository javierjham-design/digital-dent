import { useEffect, useState } from 'react'
import type { UsuarioDTO } from '@shared/types'
import { usuariosService } from '@/services/equipo.service'
import { ApiError } from '@/services/api'

const ROLES = [
  { v: 'doctor', l: 'Doctor / Médico' },
  { v: 'staff', l: 'Recepción / Staff' },
  { v: 'admin', l: 'Administrador' },
]
const ROL_LABEL: Record<string, string> = { admin: 'Administrador', doctor: 'Doctor', medico: 'Médico', staff: 'Staff' }

export function Equipo() {
  const [usuarios, setUsuarios] = useState<UsuarioDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'doctor', especialidad: '', telefono: '' })
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState('')

  function cargar() {
    setCargando(true)
    usuariosService.listar().then(setUsuarios).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }
  useEffect(cargar, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setFormError('')
    try {
      await usuariosService.crear(form)
      setForm({ name: '', username: '', password: '', role: 'doctor', especialidad: '', telefono: '' })
      setShowForm(false)
      cargar()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario')
    } finally { setGuardando(false) }
  }

  async function toggleActivo(u: UsuarioDTO) {
    await usuariosService.actualizar(u.id, { activo: !u.activo }).catch(() => {})
    cargar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipo</h1>
          <p className="text-slate-500 text-sm mt-1">{usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl transition-colors">
          {showForm ? 'Cerrar' : '+ Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={crear} className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 grid sm:grid-cols-2 gap-3">
          <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Usuario (login)" value={form.username} onChange={(v) => setForm({ ...form, username: v.toLowerCase() })} required />
          <Field label="Contraseña" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Rol</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <Field label="Especialidad" value={form.especialidad} onChange={(v) => setForm({ ...form, especialidad: v })} />
          <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
          {formError && <p className="sm:col-span-2 text-sm text-rose-600">{formError}</p>}
          <div className="sm:col-span-2">
            <button type="submit" disabled={guardando}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">
              {guardando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? (
          <p className="px-5 py-10 text-center text-slate-500 text-sm">Cargando…</p>
        ) : error ? (
          <p className="px-5 py-10 text-center text-rose-600 text-sm">{error}</p>
        ) : usuarios.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{u.name ?? u.username}</p>
              <p className="text-xs text-slate-500">
                @{u.username} · {ROL_LABEL[u.role] ?? u.role}{u.especialidad ? ` · ${u.especialidad}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {u.activo ? 'Activo' : 'Inactivo'}
              </span>
              <button onClick={() => toggleActivo(u)} className="text-xs text-slate-500 hover:text-slate-800">
                {u.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
