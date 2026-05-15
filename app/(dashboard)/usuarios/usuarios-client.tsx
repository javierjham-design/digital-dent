'use client'

import { useState } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const ROLES = {
  admin:  { label: 'Admin',  cls: 'bg-purple-100 text-purple-700' },
  doctor: { label: 'Doctor', cls: 'bg-cyan-100 text-cyan-700' },
  staff:  { label: 'Staff',  cls: 'bg-slate-100 text-slate-600' },
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTO  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const DEFAULT_DIAS = [
  { diaSemana: 0, horaInicio: '09:00', horaFin: '18:00', activo: false },
  { diaSemana: 1, horaInicio: '09:00', horaFin: '18:00', activo: true  },
  { diaSemana: 2, horaInicio: '09:00', horaFin: '18:00', activo: true  },
  { diaSemana: 3, horaInicio: '09:00', horaFin: '18:00', activo: true  },
  { diaSemana: 4, horaInicio: '09:00', horaFin: '18:00', activo: true  },
  { diaSemana: 5, horaInicio: '09:00', horaFin: '18:00', activo: true  },
  { diaSemana: 6, horaInicio: '09:00', horaFin: '14:00', activo: false },
]

interface Horario { id?: string; doctorId: string; diaSemana: number; horaInicio: string; horaFin: string; activo: boolean }
interface Contrato { id: string; doctorId: string; tipo: string; porcentaje: number | null; montoFijo: number | null; descripcion: string | null; fechaInicio: string; fechaFin: string | null; activo: boolean }
interface Usuario { id: string; name: string | null; email: string | null; role: string; rut: string | null; especialidad: string | null; telefono: string | null; activo: boolean; puedeRecibirPagos: boolean; createdAt: string; contratos: Contrato[] }

const emptyUser     = { name: '', email: '', password: '', role: 'doctor', rut: '', especialidad: '', telefono: '' }
const emptyContrato = { doctorId: '', tipo: 'PORCENTAJE', porcentaje: '', montoFijo: '', descripcion: '', fechaInicio: '', fechaFin: '' }

export function UsuariosClient({
  usuarios: init,
  contratos: initContratos,
  horarios: initHorarios,
}: {
  usuarios: Usuario[]
  contratos: Contrato[]
  horarios: Horario[]
}) {
  const [usuarios,  setUsuarios]  = useState<Usuario[]>(init)
  const [contratos, setContratos] = useState<Contrato[]>(initContratos)
  const [horarios,  setHorarios]  = useState<Horario[]>(initHorarios)

  const [showUserModal,    setShowUserModal]    = useState(false)
  const [showContratoModal,setShowContratoModal] = useState(false)
  const [showHorarioModal, setShowHorarioModal]  = useState(false)

  const [editingUser,  setEditingUser]  = useState<Usuario | null>(null)
  const [horarioDoc,   setHorarioDoc]   = useState<Usuario | null>(null)
  const [userForm,     setUserForm]     = useState(emptyUser)
  const [contratoForm, setContratoForm] = useState(emptyContrato)
  const [horarioForm,  setHorarioForm]  = useState(DEFAULT_DIAS)
  const [saving, setSaving] = useState(false)

  // ── Usuarios ─────────────────────────────────────────────────────────────
  function openNewUser() { setEditingUser(null); setUserForm(emptyUser); setShowUserModal(true) }
  function openEditUser(u: Usuario) {
    setEditingUser(u)
    setUserForm({ name: u.name ?? '', email: u.email ?? '', password: '', role: u.role, rut: u.rut ?? '', especialidad: u.especialidad ?? '', telefono: u.telefono ?? '' })
    setShowUserModal(true)
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const payload: Record<string, unknown> = { name: userForm.name, email: userForm.email, role: userForm.role, rut: userForm.rut || null, especialidad: userForm.especialidad || null, telefono: userForm.telefono || null }
    if (!editingUser || userForm.password) payload.password = userForm.password
    if (editingUser) {
      const res = await fetch(`/api/usuarios/${editingUser.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const updated = await res.json()
      setUsuarios(p => p.map(u => u.id === updated.id ? { ...u, ...updated } : u))
    } else {
      const res = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const created = await res.json()
      setUsuarios(p => [...p, { ...created, contratos: [] }])
    }
    setSaving(false); setShowUserModal(false)
  }

  async function toggleActivo(u: Usuario) {
    const res = await fetch(`/api/usuarios/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !u.activo }) })
    const updated = await res.json()
    setUsuarios(p => p.map(x => x.id === updated.id ? { ...x, ...updated } : x))
  }

  async function togglePagos(u: Usuario) {
    const res = await fetch(`/api/usuarios/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ puedeRecibirPagos: !u.puedeRecibirPagos }) })
    const updated = await res.json()
    setUsuarios(p => p.map(x => x.id === updated.id ? { ...x, ...updated } : x))
  }

  // ── Contratos ─────────────────────────────────────────────────────────────
  async function saveContrato(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const payload = { doctorId: contratoForm.doctorId, tipo: contratoForm.tipo, porcentaje: contratoForm.tipo === 'PORCENTAJE' ? Number(contratoForm.porcentaje) : null, montoFijo: contratoForm.tipo === 'MONTO_FIJO' ? Number(contratoForm.montoFijo) : null, descripcion: contratoForm.descripcion || null, fechaInicio: contratoForm.fechaInicio || new Date().toISOString().split('T')[0], fechaFin: contratoForm.fechaFin || null }
    const res = await fetch('/api/contratos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const created = await res.json()
    setContratos(p => [created, ...p.map(c => c.doctorId === created.doctorId ? { ...c, activo: false } : c)])
    setSaving(false); setShowContratoModal(false)
  }

  // ── Horarios ──────────────────────────────────────────────────────────────
  function openHorario(u: Usuario) {
    setHorarioDoc(u)
    const docHorarios = horarios.filter(h => h.doctorId === u.id)
    const form = DEFAULT_DIAS.map(def => {
      const existing = docHorarios.find(h => h.diaSemana === def.diaSemana)
      return existing ? { ...def, horaInicio: existing.horaInicio, horaFin: existing.horaFin, activo: existing.activo } : { ...def }
    })
    setHorarioForm(form)
    setShowHorarioModal(true)
  }

  function setDia(idx: number, field: string, value: string | boolean) {
    setHorarioForm(f => f.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  async function saveHorario(e: React.FormEvent) {
    e.preventDefault()
    if (!horarioDoc) return
    setSaving(true)
    const res = await fetch('/api/horarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId: horarioDoc.id, days: horarioForm }),
    })
    const saved: Horario[] = await res.json()
    setHorarios(prev => {
      const withoutDoc = prev.filter(h => h.doctorId !== horarioDoc.id)
      return [...withoutDoc, ...saved]
    })
    setSaving(false); setShowHorarioModal(false)
  }

  function doctorHorarioResumen(doctorId: string) {
    const dias = horarios.filter(h => h.doctorId === doctorId && h.activo)
    if (dias.length === 0) return null
    return dias.map(h => DIAS_CORTO[h.diaSemana]).join(' · ')
  }

  const doctores = usuarios.filter(u => u.role === 'doctor' || u.role === 'admin')
  const doctoresConContrato = contratos.filter(c => c.activo).map(c => c.doctorId)

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipo Clínico</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gestiona usuarios, roles, contratos y horarios</p>
        </div>
        <button onClick={openNewUser} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Nuevo usuario
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Usuarios activos', value: usuarios.filter(u => u.activo).length },
          { label: 'Dentistas', value: doctores.filter(u => u.activo).length },
          { label: 'Con contrato activo', value: doctoresConContrato.length },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla usuarios */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Usuarios</h2>
        </div>
        {usuarios.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No hay usuarios registrados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Usuario', 'RUT', 'Especialidad', 'Teléfono', 'Rol', 'Contrato', 'Horario', 'Pagos', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {usuarios.map(u => {
                const contrato = u.contratos?.[0]
                const horarioLabel = doctorHorarioResumen(u.id)
                return (
                  <tr key={u.id} className={cn('group hover:bg-slate-50 transition-colors', !u.activo && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{(u.name ?? u.email ?? '?')[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{u.name ?? '—'}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{u.rut ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{u.especialidad ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{u.telefono ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ROLES[u.role as keyof typeof ROLES]?.cls ?? 'bg-slate-100 text-slate-600')}>
                        {ROLES[u.role as keyof typeof ROLES]?.label ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {contrato ? (
                        <span className="text-xs text-slate-700">{contrato.tipo === 'PORCENTAJE' ? `${contrato.porcentaje}%` : formatCLP(contrato.montoFijo ?? 0)}</span>
                      ) : (
                        <span className="text-xs text-slate-300">Sin contrato</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {horarioLabel ? (
                        <span className="text-xs text-emerald-600 font-medium">{horarioLabel}</span>
                      ) : (
                        <span className="text-xs text-slate-300">Sin horario</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePagos(u)}
                        title={u.puedeRecibirPagos ? 'Quitar permiso de caja' : 'Habilitar para recibir pagos'}
                        className={cn('relative w-9 h-5 rounded-full transition-colors flex-shrink-0', u.puedeRecibirPagos ? 'bg-emerald-500' : 'bg-slate-300')}
                      >
                        <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', u.puedeRecibirPagos ? 'left-4' : 'left-0.5')} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => openEditUser(u)} title="Editar" className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onClick={() => openHorario(u)} title="Configurar horario" className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg hover:bg-violet-50">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </button>
                        <button onClick={() => toggleActivo(u)} title={u.activo ? 'Desactivar' : 'Activar'} className={cn('p-1.5 rounded-lg', u.activo ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50')}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {u.activo
                              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>}
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Horarios de atención */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Horarios de Atención</h2>
          <p className="text-xs text-slate-400 mt-0.5">Click en el ícono de reloj en cada usuario para configurar su horario</p>
        </div>
        <div className="divide-y divide-slate-50">
          {doctores.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No hay doctores registrados</div>
          ) : doctores.map(u => {
            const dias = horarios.filter(h => h.doctorId === u.id && h.activo)
            return (
              <div key={u.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{(u.name ?? u.email ?? '?')[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{u.name ?? u.email ?? '—'}</p>
                    <p className="text-xs text-slate-400">{u.especialidad ?? u.role}</p>
                  </div>
                </div>
                {dias.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-xs text-slate-300 italic">Sin horario configurado</span>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    {dias.map(h => (
                      <div key={h.diaSemana} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                        <span className="text-xs font-semibold text-slate-700 w-7">{DIAS_CORTO[h.diaSemana]}</span>
                        <span className="text-xs text-slate-500">{h.horaInicio} – {h.horaFin}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => openHorario(u)}
                  className="flex items-center gap-1.5 text-xs font-medium text-violet-600 border border-violet-200 bg-violet-50 hover:bg-violet-100 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Configurar
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Contratos */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Contratos de Trabajo</h2>
          <button onClick={() => { setContratoForm(emptyContrato); setShowContratoModal(true) }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-600 border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Nuevo contrato
          </button>
        </div>
        {contratos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No hay contratos. Crea uno para cada dentista.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {contratos.map(c => {
              const doctor = usuarios.find(u => u.id === c.doctorId)
              return (
                <div key={c.id} className={cn('px-6 py-4 flex items-center justify-between', !c.activo && 'opacity-40')}>
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">{(doctor?.name ?? doctor?.email ?? '?')[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{doctor?.name ?? doctor?.email ?? 'Doctor'}</p>
                      <p className="text-xs text-slate-400">{doctor?.especialidad ?? ''} · Desde {formatDate(new Date(c.fechaInicio))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {c.tipo === 'PORCENTAJE' ? `${c.porcentaje}% por tratamiento` : `${formatCLP(c.montoFijo ?? 0)} fijo por tratamiento`}
                      </p>
                      <p className="text-xs text-slate-400">{c.descripcion ?? ''}</p>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', c.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {c.activo ? 'Vigente' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODAL: Usuario ── */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={saveUser} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
                  <input required value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input required type="email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña {editingUser ? '(dejar vacío para no cambiar)' : '*'}</label>
                  <input type="password" required={!editingUser} value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUser ? '••••••••' : ''} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                  <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="admin">Admin</option>
                    <option value="doctor">Doctor</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RUT</label>
                  <input value={userForm.rut} onChange={e => setUserForm({ ...userForm, rut: e.target.value })} placeholder="12.345.678-9" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad</label>
                  <input value={userForm.especialidad} onChange={e => setUserForm({ ...userForm, especialidad: e.target.value })} placeholder="Odontología General" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input value={userForm.telefono} onChange={e => setUserForm({ ...userForm, telefono: e.target.value })} placeholder="+56 9 1234 5678" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Guardando…' : editingUser ? 'Actualizar' : 'Crear usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Horario ── */}
      {showHorarioModal && horarioDoc && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Horario de atención</h2>
                <p className="text-sm text-slate-400 mt-0.5">{horarioDoc.name ?? horarioDoc.email}</p>
              </div>
              <button onClick={() => setShowHorarioModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={saveHorario} className="p-6">
              <div className="space-y-2">
                {/* Column headers */}
                <div className="grid grid-cols-[100px_1fr_1fr_40px] gap-3 px-1 pb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Día</span>
                  <span className="text-xs font-semibold text-slate-500 uppercase">Hora inicio</span>
                  <span className="text-xs font-semibold text-slate-500 uppercase">Hora fin</span>
                  <span className="text-xs font-semibold text-slate-500 uppercase">On</span>
                </div>
                {horarioForm.map((dia, idx) => (
                  <div key={dia.diaSemana}
                    className={cn('grid grid-cols-[100px_1fr_1fr_40px] gap-3 items-center p-3 rounded-xl border transition-colors',
                      dia.activo ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200 opacity-60')}>
                    <span className={cn('text-sm font-semibold', dia.activo ? 'text-cyan-700' : 'text-slate-500')}>
                      {DIAS_SEMANA[dia.diaSemana]}
                    </span>
                    <input
                      type="time" value={dia.horaInicio} disabled={!dia.activo}
                      onChange={e => setDia(idx, 'horaInicio', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-white disabled:text-slate-300"
                    />
                    <input
                      type="time" value={dia.horaFin} disabled={!dia.activo}
                      onChange={e => setDia(idx, 'horaFin', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-white disabled:text-slate-300"
                    />
                    <button type="button" onClick={() => setDia(idx, 'activo', !dia.activo)}
                      className={cn('w-9 h-5 rounded-full transition-colors relative flex-shrink-0',
                        dia.activo ? 'bg-cyan-500' : 'bg-slate-300')}>
                      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                        dia.activo ? 'left-4' : 'left-0.5')} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => setShowHorarioModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Guardando…' : 'Guardar horario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Contrato ── */}
      {showContratoModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo contrato</h2>
              <button onClick={() => setShowContratoModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={saveContrato} className="p-6 space-y-4">
              {contratoForm.doctorId && doctoresConContrato.includes(contratoForm.doctorId) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  Este doctor ya tiene un contrato activo. Al guardar, el anterior quedará inactivo.
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor *</label>
                <select required value={contratoForm.doctorId} onChange={e => setContratoForm({ ...contratoForm, doctorId: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar doctor</option>
                  {doctores.map(d => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de contrato</label>
                <select value={contratoForm.tipo} onChange={e => setContratoForm({ ...contratoForm, tipo: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="PORCENTAJE">Porcentaje del tratamiento</option>
                  <option value="MONTO_FIJO">Monto fijo por tratamiento</option>
                </select>
              </div>
              {contratoForm.tipo === 'PORCENTAJE' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Porcentaje (%)</label>
                  <input required type="number" min="1" max="100" value={contratoForm.porcentaje} onChange={e => setContratoForm({ ...contratoForm, porcentaje: e.target.value })} placeholder="40" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto fijo (CLP)</label>
                  <input required type="number" min="0" value={contratoForm.montoFijo} onChange={e => setContratoForm({ ...contratoForm, montoFijo: e.target.value })} placeholder="50000" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha inicio</label>
                  <input type="date" value={contratoForm.fechaInicio} onChange={e => setContratoForm({ ...contratoForm, fechaInicio: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha fin (opcional)</label>
                  <input type="date" value={contratoForm.fechaFin} onChange={e => setContratoForm({ ...contratoForm, fechaFin: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (opcional)</label>
                <input value={contratoForm.descripcion} onChange={e => setContratoForm({ ...contratoForm, descripcion: e.target.value })} placeholder="Ej: Contrato indefinido..." className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowContratoModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Guardando…' : 'Crear contrato'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
