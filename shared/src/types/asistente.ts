// DTOs del Asistente de IA (etapa 1). Forma serializada que viaja por la API;
// los pacientes viajan REHIDRATADOS (nombre) — la seudonimización es interna.

export type TipoColumnaAsistente = 'texto' | 'entero' | 'dinero' | 'fecha' | 'paciente' | 'porcentaje'

export interface ColumnaAsistenteDTO { clave: string; etiqueta: string; tipo: TipoColumnaAsistente }

export interface HerramientaInfoDTO { nombre: string; descripcion: string }

export interface EstadoAsistenteDTO {
  habilitado: boolean
  herramientas: HerramientaInfoDTO[]
  uso: { consultasHoy: number; limiteDia: number }
}

export interface ResultadoAsistenteDTO {
  id: string
  herramienta: string
  parametros: unknown
  columnas: ColumnaAsistenteDTO[]
  filas: Record<string, unknown>[]
  totalFilas: number
}

export interface MensajeAsistenteDTO {
  id: string
  rol: 'user' | 'assistant'
  contenido: string
  createdAt: string
}

export interface SesionAsistenteDTO {
  id: string
  titulo: string
  createdAt: string
  updatedAt: string
}

export interface SesionAsistenteDetalleDTO extends SesionAsistenteDTO {
  mensajes: MensajeAsistenteDTO[]
  resultados: ResultadoAsistenteDTO[]
}

export interface RespuestaTurnoDTO {
  mensaje: MensajeAsistenteDTO
  resultados: ResultadoAsistenteDTO[]
  // Cifras del texto que no se pudieron respaldar con los resultados del turno.
  cifrasNoVerificadas: string[]
}
