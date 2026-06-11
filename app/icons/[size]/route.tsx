import { ImageResponse } from 'next/og'

// Genera los íconos PWA de Cláriva en tiempo de build (estáticos).
// Soporta variantes "any" (192/512) y "maskable" (con safe zone interna del 80%).

export const dynamic = 'force-static'

type Variant = { size: number; maskable: boolean }

const VARIANTS: Record<string, Variant> = {
  '192':           { size: 192, maskable: false },
  '512':           { size: 512, maskable: false },
  'maskable-192':  { size: 192, maskable: true  },
  'maskable-512':  { size: 512, maskable: true  },
}

export async function generateStaticParams() {
  return Object.keys(VARIANTS).map((size) => ({ size }))
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params
  const cfg = VARIANTS[size]
  if (!cfg) return new Response('Not found', { status: 404 })

  // En íconos maskable Android puede recortar hasta el 20% exterior.
  // Para mantener el diseño visible, reducimos el contenido al 70% central
  // y rellenamos todo el lienzo de cyan.
  const innerScale = cfg.maskable ? 0.70 : 1
  const cornerRadius = cfg.maskable ? 0 : Math.round(cfg.size * 0.22)
  const fontSize = Math.round(cfg.size * innerScale * 0.62)

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
          borderRadius: cornerRadius,
        }}
      >
        <div
          style={{
            width: `${innerScale * 100}%`,
            height: `${innerScale * 100}%`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize,
            fontWeight: 700,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: -fontSize * 0.04,
            lineHeight: 1,
          }}
        >
          C
        </div>
      </div>
    ),
    {
      width: cfg.size,
      height: cfg.size,
    },
  )
}
