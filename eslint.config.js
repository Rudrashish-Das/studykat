import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

/**
 * Flat config. Three things it is here to catch that the compiler will not:
 *
 *   1. Floating promises and misused awaits — the economy is all async, and a
 *      dropped rejection there is a silently lost coin award.
 *   2. Hook dependency mistakes, which in a server-anchored timer show up as a
 *      clock that stops rather than as a crash.
 *   3. Accessibility regressions, since §9 is a requirement rather than a
 *      nicety and the SVG-heavy UI makes them easy to introduce.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },

  // Application source: fully type-aware.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Unused code is a smell, but an intentionally-ignored argument is not.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // The economy is async end to end; a dropped promise there loses a coin
      // award with no error anywhere.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        // onClick={async () => ...} is idiomatic React and safe here.
        { checksVoidReturn: { attributes: false } },
      ],

      // `any` defeats the point of strict mode.
      '@typescript-eslint/no-explicit-any': 'error',

      // Non-null assertions are load-bearing in a few places where a guard
      // above already proved the value; flag them so each one is a decision.
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Tailwind class strings are long; that is not a complexity signal.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },

  // The Supabase schema types must be type aliases, not interfaces:
  // postgrest-js constrains every Row to `Record<string, unknown>`, and only
  // aliases get an implicit index signature.
  {
    files: ['src/lib/supabase/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },

  // Tests: the same rules, minus the ones that fight fixtures.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Build config files run in Node and are not part of the app program.
  {
    files: ['*.config.{ts,js}', 'vite.config.ts', 'tailwind.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
)
