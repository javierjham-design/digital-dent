import { ImageResponse } from 'next/og'

// iOS no usa manifest icons para "Agregar a pantalla de inicio":
// usa el apple-touch-icon servido en el head. 180x180 es el tamaño recomendado.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 60%, #155e75 100%)',
          color: '#ffffff',
          fontSize: 122,
          fontWeight: 700,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: -5,
          lineHeight: 1,
        }}
      >
        C
      </div>
    ),
    size,
  )
}
