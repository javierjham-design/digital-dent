'use client'

import { useState } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const ROLES = { admin: { label: 'Admin', cls: 'bg-purple-100 text-purple-700' }, doctor: { label: 'Doctor', cls: 'bg-cyan-100 text-cyan-700' }, staff: { label: 'Staff', cls: 'bg-slate-100 text-slate-600' } }

interface Contrato { id: string; doctorId: string; tipo: string; porcentaje: number | null; montoFijo: number | null; descripcion: string | null; fechaInicio: string; fechaFin: string | null; activo: boolean; doctor?: any }
interface Usuario { id: string; name: string | null; email: string; role: string; rut: string | null; especialidad: string | null; telefono: string | null; activo: boolean; createdAt: string; contratos: Contrato[] }

const emptyUser = { name: '', email: '', password: '', role: 'doctor', rut: '', especialidad: '', telefono: '' }
const emptyContrato = { doctorId: '', tipo: 'PORCENTAJE', porcentaje: '', montoFijo: '', descripcion: '', fechaInicio: '', fechaFin: '' }

export function UsuariosClient({ usuarios: init, contratos: initContratos }: { usuarios: Usuario[]; contratos: Contrato[] }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>(init)
  const [contratos, setContratos] = useState<Contrato[]>(initContratos)
  const [showUserModal, setShowUserModal] = useState(false)
  const [showContratoModal, setShowContratoModal] = useState(false)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)
  const [userForm, setUserForm] = useState(emptyUser)
  const [contratoForm, setContratoForm] = useState(emptyContrato)
  const [saving, setSaving] = useState(false)

  function openNewUser() { setEditingUser(null); setUserForm(emptyUser); setShowUserModal(true) }
  function openEditUser(u: Usuario) { setEditingUser(u); setUserForm({ name: u.name ?? '', email: u.email, password: '', role: u.role, rut: u.rut ?? '', especialidad: u.especialidad ?? '', telefono: u.telefono ?? '' }); setShowUserModal(true) }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const payload: any = { name: userForm.name, email: userForm.email, role: userForm.role, rut: userForm.rut || null, especialidad: userForm.especialidad || null, telefono: userForm.telefono || null }
    if (!editingUser || userForm.password) payload.password = userForm.password
    if (editingUser) {
      const res = await fetch(`/api/usuarios/${editingUser.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const updated = await res.json()
      setUsuarios((p) => p.map((u) => u.id === updated.id ? { ...u, ...updated } : u))
    } else {
      const res = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const created = await res.json()
      setUsuarios((p) => [...p, { ...created, contratos: [] }])
    }
    setSaving(false); setShowUserModal(false)
  }

  async function toggleActivo(u: Usuario) {
    const res = await fetch(`/api/usuarios/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !u.activo }) })
    const updated = await res.json()
    setUsuarios((p) => p.map((x) => x.id === updated.id ? { ...x, ...updated } : x))
  }

  async function saveContrato(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const payload = { doctorId: contratoForm.doctorId, tipo: contratoForm.tipo, porcentaje: contratoForm.tipo === 'PORCENTAJE' ? Number(contratoForm.porcentaje) : null, montoFijo: contratoForm.tipo === 'MONTO_FIJO' ? Number(contratoForm.montoFijo) : null, descripcion: contratoForm.descripcion || null, fechaInicio: contratoForm.fechaInicio || new Date().toISOString().split('T')[0], fechaFin: contratoForm.fechaFin || null }
    const res = await fetch('/api/contratos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const created = await res.json()
    setContratos((p) => [created, ...p.map((c) => c.doctorId === created.doctorId ? { ...c, activo: false } : c)])
    setSaving(false); setShowContratoModal(false)
  }

  const doctores = usuarios.filter((u) => u.role === 'doctor')
  const doctoresConContrato = contratos.filter((c) => c.activo).map((c) => c.doctorId)

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipo Clínico</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gestiona usuarios, roles y contratos de trabajo</p>
        </div>
        <button onClick={openNewUser} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Nuevo usuario
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Usuarios activos', value: usuarios.filter((u) => u.activo).length },
          { label: 'Dentistas', value: doctores.filter((u) => u.activo).length },
          { label: 'Con contrato activo', value: doctoresConContrato.length },
        ].map((s) => (
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
                {['Usuario', 'RUT', 'Especialidad', 'Teléfono', 'Rol', 'Contrato', 'Estado', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {usuarios.map((u) => {
                const contrato = u.contratos?.[0]
                return (
                  <tr key={u.id} className={cn('group hover:bg-slate-50 transition-colors', !u.activo && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{(u.name ?? u.email)[0].toUpperCase()}</span>
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
                        <span className="text-xs text-slate-700">
                          {contrato.tipo === 'PORCENTAJE' ? `${contrato.porcentaje}%` : formatCLP(contrato.montoFijo ?? 0)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">Sin contrato</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => openEditUser(u)} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onClick={() => toggleActivo(u)} className={cn('p-1.5 rounded-lg', u.activo ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50')}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {u.activo ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>}
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
            {contratos.map((c) => {
              const doctor = usuarios.find((u) => u.id === c.doctorId)
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

      {/* Modal usuario */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form onSubmit={saveUser} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
                  <input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input required type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña {editingUser ? '(dejar en blanco para no cambiar)' : '*'}</label>
                  <input type="password" required={!editingUser} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUser ? '••••••••' : ''} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="admin">Admin</option>
                    <option value="doctor">Doctor</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RUT</label>
                  <input value={userForm.rut} onChange={(e) => setUserForm({ ...userForm, rut: e.target.value })} placeholder="12.345.678-9" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad</label>
                  <input value={userForm.especialidad} onChange={(e) => setUserForm({ ...userForm, especialidad: e.target.value })} placeholder="Odontología General" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input value={userForm.telefono} onChange={(e) => setUserForm({ ...userForm, telefono: e.target.value })} placeholder="+56 9 1234 5678" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal contrato */}
      {showContratoModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo contrato</h2>
              <button onClick={() => setShowContratoModal(false)} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form onSubmit={saveContrato} className="p-6 space-y-4">
              {contratoForm.doctorId && doctoresConContrato.includes(contratoForm.doctorId) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  Este doctor ya tiene un contrato activo. Al guardar, el anterior quedará inactivo.
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor *</label>
                <select required value={contratoForm.doctorId} onChange={(e) => setContratoForm({ ...contratoForm, doctorId: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar doctor</option>
                  {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de contrato</label>
                <select value={contratoForm.tipo} onChange={(e) => setContratoForm({ ...contratoForm, tipo: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="PORCENTAJE">Porcentaje del tratamiento</option>
                  <option value="MONTO_FIJO">Monto fijo por tratamiento</option>
                </select>
              </div>
              {contratoForm.tipo === 'PORCENTAJE' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Porcentaje (%)</label>
                  <input required type="number" min="1" max="100" value={contratoForm.porcentaje} onChange={(e) => setContratoForm({ ...contratoForm, porcentaje: e.target.value })} placeholder="40" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto fijo (CLP)</label>
                  <input required type="number" min="0" value={contratoForm.montoFijo} onChange={(e) => setContratoForm({ ...contratoForm, montoFijo: e.target.value })} placeholder="50000" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha inicio</label>
                  <input type="date" value={contratoForm.fechaInicio} onChange={(e) => setContratoForm({ ...contratoForm, fechaInicio: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha fin (opcional)</label>
                  <input type="date" value={contratoForm.fechaFin} onChange={(e) => setContratoForm({ ...contratoForm, fechaFin: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (opcional)</label>
                <input value={contratoForm.descripcion} onChange={(e) => setContratoForm({ ...contratoForm, descripcion: e.target.value })} placeholder="Ej: Contrato indefinido..." className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowContratoModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Guardando...' : 'Crear contrato'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
