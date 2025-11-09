// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Follows ESLint v9 flat config format.
// 3. Includes TypeScript-specific rules.
// 4. Configures for Azure Functions conventions.
// 5. Adds structured error handling.
// -----------------------------------------------------------

import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.mjs',
    ],
  },

  // Base JavaScript/TypeScript config
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // Remove project reference for simpler parsing
        // project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...typescript.configs.recommended.rules,

      // TypeScript-specific rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      // Azure Functions-specific conventions
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',

      // Best practices
      'no-console': 'off', // Allow console for Azure Functions logging
      'no-undef': 'off', // Disable for TypeScript - @typescript-eslint handles this
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Test files - relaxed rules
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
