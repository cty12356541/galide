module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: ['out/**', 'dist/**', 'node_modules/**', '*.cjs'],
  rules: { '@typescript-eslint/no-explicit-any': 'error' }
}
