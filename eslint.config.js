// ESLint flat config. Scope: src and tests. Only rules the repo passes (or nearly passes) are errors.
// Rules with existing violations are off, with the count at the review date (2026-11-06). Turn one on
// when its count is zero, and fix the violations in the same change. See docs/CODING_STANDARDS.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Errors (zero or near-zero violations).
      '@typescript-eslint/no-explicit-any': 'error', // 0
      'react-hooks/rules-of-hooks': 'error', // 0
      'react-hooks/exhaustive-deps': 'error', // 3: App.tsx, scene/, sky/
      // Off until the count is zero (2026-11-06 counts in brackets).
      '@typescript-eslint/no-unused-vars': 'off', // 5: buildings 1, tests 4
      'no-unused-vars': 'off',
      'prefer-const': 'off', // 4: buildings 1, life 1, tests 2
      'no-useless-assignment': 'off', // 12: audio 1, buildings 1, life 3, traffic 1, ui 2, tests 4
      '@typescript-eslint/no-unused-expressions': 'off', // 1: dev/treeCompare
    },
  },
);
