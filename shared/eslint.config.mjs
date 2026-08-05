import tseslint from 'typescript-eslint'
import { ignoresComunes, reglasComunes } from '../eslint.base.mjs'

// Shared (solo tipos y constantes DTO). Config mínima: typescript-eslint recommended,
// sin type-aware ni React.
export default tseslint.config(
  ignoresComunes(),
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'] },
  reglasComunes(),
)
