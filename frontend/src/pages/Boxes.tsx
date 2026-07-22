import { useEffect, useState } from 'react'
import { boxesService, type BoxDTO } from '@/services/boxes.service'
import { ApiError } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'

// Configuración de boxes / salas de atención (OPCIONAL). Si no se crea ninguno,
// la agenda funciona igual (citas sin box). Sirven para identificar dónde se
// atiende: Box 1, Box Estética, Pabellón, etc.
export function Boxes() {
  const { user } = useAuth()
  const puedeConfig = user?.role === 'admin' || Boolean(user?.permisos?.puedeConfigurarClinica)
  const [lista, setLista] = useState<BoxDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('')
  const [aviso, setAviso] = useState<{ t: string; ok: boolean } | null>(null)
  const notify = (t: string, ok = true) => { setAviso({ t, ok }); setTimeout(() => setAviso(null), 3500) }

  const cargar = () => boxesService.listar().then(setLista).catch(() => {}).finally(() => setCargando(false))
  useEffect(() => { cargar() }, [])

  async function crear() {
    if (!nombre.trim()) return
    try { await boxesService.crear({ nombre: nombre.trim(), tipo: tipo.trim() || undefined }); setNombre(''); setTipo(''); cargar(); notify('Box creado') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  async function renombrar(b: BoxDTO) {
    const n = window.prompt('Nombre del box / sala', b.nombre)
    if (n && n.trim() && n.trim() !== b.nombre) { try { await boxesService.actualizar(b.id, { nombre: n.trim() }); cargar() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) } }
  }
  async function toggle(b: BoxDTO) {
    try { await boxesService.actualizar(b.id, { activo: !b.activo }); cargar() } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }
  async function eliminar(b: BoxDTO) {
    if (!confirm(`¿Eliminar "${b.nombre}"? Las citas que lo tenían quedarán sin box.`)) return
    try { await boxesService.eliminar(b.id); cargar(); notify('Box eliminado') } catch (e) { notify(e instanceof ApiError ? e.message : 'Error', false) }
  }

  if (!puedeConfig) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso a la configuración de boxes. Pídele a un administrador el permiso <span className="font-medium">“Configurar la clínica”</span>.</p>

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Boxes / Salas de atención</h1>
      <p className="text-sm text-slate-500 mb-5">Opcional. Define los espacios donde se atiende (Box 1, Box Estética, Pabellón…). Si no creas ninguno, la agenda funciona igual y las citas quedan “sin box”. Podrás asignar el box al agendar o cambiarlo desde la cita.</p>
      {aviso && <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${aviso.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{aviso.t}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <p className="text-sm font-semibold text-slate-700 mb-2">Agregar box / sala</p>
        <div className="flex flex-wrap gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} placeholder="Nombre (ej: Box Estética, Pabellón 1)" className="flex-1 min-w-[12rem] px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <input value={tipo} onChange={(e) => setTipo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} placeholder="Tipo (opcional)" className="w-40 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <button onClick={crear} disabled={!nombre.trim()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Agregar</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Cargando…</p>
          : lista.length === 0 ? <p className="px-5 py-8 text-center text-slate-400 text-sm">Aún no hay boxes. La agenda funciona igual sin ellos.</p>
          : lista.map((b) => (
            <div key={b.id} className={`flex items-center justify-between gap-3 px-5 py-3 ${b.activo ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{b.nombre}</p>
                {b.tipo && <p className="text-xs text-slate-500">{b.tipo}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs font-semibold">
                <button onClick={() => renombrar(b)} className="text-slate-500 hover:text-slate-800">Renombrar</button>
                <button onClick={() => toggle(b)} className={b.activo ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800'}>{b.activo ? 'Desactivar' : 'Activar'}</button>
                <button onClick={() => eliminar(b)} className="text-rose-500 hover:text-rose-700">Eliminar</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
