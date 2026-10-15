import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    // Playwright fixtures call a function named `use`, which is not React's.
    files: ['apps/playground/e2e/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // Browser scripts: their page.evaluate callbacks run in the page.
    files: ['apps/playground/e2e/**/*.mjs', 'benchmarks/**/*.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        HTMLInputElement: 'readonly',
        Event: 'readonly',
        setTimeout: 'readonly',
        performance: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
);
