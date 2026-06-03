const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    ignores: [
      '.expo/**',
      'node_modules/**',
      '.agents/**',
      'types/database.types.ts',
    ],
  },
  ...expoConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      // Warn on explicit any so we can gradually clean up the 40+ instances
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Prefer const assertions for literal types
      '@typescript-eslint/prefer-as-const': 'error',
      // Prevent relative parent imports — use aliases (@/components, @/hooks, etc.)
      // import/no-relative-parent-imports does not understand @/ aliases, so we use
      // no-restricted-imports with a regex that matches ../ and ../../ in the source.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '../../*'],
              message: 'Relative parent imports are not allowed. Use path aliases (@/components, @/hooks, @/utils, etc.) instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // Test files can use relaxed rules
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
