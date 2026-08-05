import tseslint from 'typescript-eslint'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import { ignoresComunes, reglasComunes } from '../eslint.base.mjs'

// Frontend (Vite + React + TS). typescript-eslint recommended + reglas de React y de
// hooks. Se apagan las reglas que no aplican a este stack (TS en vez de prop-types,
// JSX runtime automático) o que serían puro ruido en una UI en español.
export default tseslint.config(
  ignoresComunes(),
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',      // Vite/React 17+: no hace falta importar React
      'react/prop-types': 'off',              // los tipos los da TypeScript
      'react/no-unescaped-entities': 'off',   // apóstrofes/comillas en texto JSX en español
      'react/display-name': 'off',
    },
  },
  reglasComunes(),
)
