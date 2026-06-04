import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForTokens, saveTokensForClinica, verifyOAuthState } from '@/lib/google'

// Callback OAuth (endpoint público en app.clariva.cl).
// Recibe `code` + `state`, valida la firma del state, intercambia el code
// por tokens, los guarda cifrados en la clínica correcta, y redirige al
// subdominio de esa clínica con un flag de resultado.
//
// No requiere sesión del usuario porque puede llegar desde otro tab/browser.
// La autorización viene del propio state firmado.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const error = searchParams.get('error')

  // Domain donde devolveremos al usuario tras procesar.
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'clariva.cl'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'

  // Si el usuario canceló o Google devolvió error explícito.
  if (error) {
    return NextResponse.redirect(`${proto}://${platformDomain}/configuracion?google=error&reason=${encodeURIComponent(error)}`)
  }
  if (!code || !stateRaw) {
    return NextResponse.redirect(`${proto}://${platformDomain}/configuracion?google=error&reason=missing_params`)
  }

  const state = verifyOAuthState(stateRaw)
  if (!state) {
    return NextResponse.redirect(`${proto}://${platformDomain}/configuracion?google=error&reason=invalid_state`)
  }

  // Verificamos que la clínica del state sigue existiendo y el usuario que
  // inició el flow todavía es admin (defensa en profundidad).
  const [clinica, user] = await Promise.all([
    prisma.clinica.findUnique({
      where: { id: state.clinicaId },
      select: { id: true, slug: true, activo: true },
    }),
    prisma.user.findUnique({
      where: { id: state.userId },
      select: { id: true, clinicaId: true, role: true, name: true, email: true },
    }),
  ])
  if (!clinica || !clinica.activo || clinica.slug !== state.slug) {
    return NextResponse.redirect(`${proto}://${platformDomain}/configuracion?google=error&reason=clinica_not_found`)
  }
  if (!user || user.clinicaId !== clinica.id || user.role !== 'admin') {
    return NextResponse.redirect(`${proto}://${clinica.slug}.${platformDomain}/configuracion?google=error&reason=unauthorized`)
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    await saveTokensForClinica({
      clinicaId: clinica.id,
      tokens,
      connectedById: user.id,
      connectedByName: user.name ?? user.email,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'exchange_failed'
    return NextResponse.redirect(`${proto}://${clinica.slug}.${platformDomain}/configuracion?google=error&reason=${encodeURIComponent(msg)}`)
  }

  return NextResponse.redirect(`${proto}://${clinica.slug}.${platformDomain}/configuracion?google=connected`)
}
