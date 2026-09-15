import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/assets/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The flat config file itself is plain JS and outside the TS project.
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
