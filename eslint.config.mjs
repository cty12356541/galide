import tseslint from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  // Global ignores (replaces .eslintignore + .eslintrc ignorePatterns)
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'build/**', '.worktrees/**', '*.cjs'],
  },

  // TypeScript ESLint recommended flat config (turns off no-undef etc. for TS files)
  ...tseslint.configs['flat/recommended'],

  // Browser + Node globals (replaces old `env: { node: true, browser: true }`)
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },

  // React hooks plugin + custom project rules
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Turn off new rules in @typescript-eslint v8 recommended not in v7
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
]
