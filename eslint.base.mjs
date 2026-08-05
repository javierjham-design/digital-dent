// Base compartida de ESLint (flat config) para el monorepo. NO importa dependencias
// directamente: cada servicio tiene su propio node_modules, así que la config de cada
// servicio importa `typescript-eslint`/plugins desde el suyo y compone estos bloques.
// Ver docs/AI_CHANGELOG.md (ESLint) y CLAUDE.md.

export function ignoresComunes(extra = []) {
  return {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/prisma/generated/**',
      '**/prisma/legacy/**',
      'eslint.config.mjs',
      ...extra,
    ],
  }
}

// Ajustes comunes sobre las reglas de typescript-eslint recommended.
export function reglasComunes() {
  return {
    rules: {
      // Los `_`-prefixed son intencionalmente sin usar; los catch sin usar no molestan.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // El código usa `any` a propósito en varios puntos (raw queries, límites de tipos
      // de librerías). No convertirlo en ruido; se puede endurecer más adelante.
      '@typescript-eslint/no-explicit-any': 'off',
      // `cond ? a() : b()` y `cond && fn()` como sentencia son patrones intencionales
      // (ambos con efecto), no expresiones olvidadas.
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true }],
    },
  }
}
