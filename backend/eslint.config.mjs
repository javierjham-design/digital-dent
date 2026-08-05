import tseslint from 'typescript-eslint'
import globals from 'globals'
import { ignoresComunes, reglasComunes } from '../eslint.base.mjs'

// Backend (Node/Express + Prisma). Usa typescript-eslint `recommended` (no el preset
// type-checked completo, que llenaría de ruido no-unsafe-*), y habilita SOLO la regla
// type-aware que importa acá: no-floating-promises (promesas sin await/void → bugs).
export default tseslint.config(
  ignoresComunes(),
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  reglasComunes(),
)
