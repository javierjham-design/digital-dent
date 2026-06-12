import type { NextConfig } from "next";

// Headers de seguridad aplicados a TODAS las respuestas.
// Nota: no definimos script-src en la CSP porque Next.js usa scripts inline
// propios; restringimos lo que sí podemos sin romper la app.
const securityHeaders = [
  // Fuerza HTTPS por 2 años, incluyendo subdominios de clínicas.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Nadie puede embeber Cláriva en un iframe (anti-clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  // El navegador no debe adivinar content-types (anti-MIME-sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtrar URLs internas (con ids de pacientes) a sitios externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara/micrófono/geolocalización: bloquearlos explícitamente.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // no anunciar el framework en cada respuesta
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
