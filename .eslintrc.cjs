module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: ['out/**', 'dist/**', 'node_modules/**', '*.cjs'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ],
    // react-hooks plugin 未装;该规则 baseline 不存在,关掉避免 false positive
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/rules-of-hooks': 'off'
  }
}
