// @ts-check
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript source files
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'entrypoints/**/*.ts', 'entrypoints/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'security': securityPlugin,
    },
    rules: {
      // TypeScript strict rules (without requiring full project type checking for now)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // Security rules — critical for extension code
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',

      // Privacy protection — prevents raw values from appearing in logs
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Prevent dangerous DOM manipulation
      'no-restricted-properties': [
        'error',
        {
          object: 'element',
          property: 'innerHTML',
          message: 'Use textContent or createElement instead to prevent XSS.',
        },
        {
          object: 'document',
          property: 'write',
          message: 'Do not use document.write.',
        },
      ],

      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off',         // We use TypeScript for prop types
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // General quality
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Test files — relax some rules
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off', // Vitest globals are injected
    },
  },

  // Ignore generated and config files
  {
    ignores: ['.wxt/**', '.output/**', 'node_modules/**', 'coverage/**'],
  },
];

export default config;
