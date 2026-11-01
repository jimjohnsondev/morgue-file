// ESLint setup for Morgue File. Every rule here backs a line in docs/STYLE.md.
import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

/** Constructs docs/STYLE.md rules out, with the message shown when lint finds one. */
const bannedSyntax = [
  { selector: 'TSEnumDeclaration', message: 'Use a string union instead of an enum.' },
  { selector: 'TSInterfaceDeclaration', message: 'Use a type alias instead of an interface.' },
  {
    selector: 'ClassDeclaration[superClass.name!=/Error$/]',
    message: 'Use plain functions and types. Classes are only for Error subclasses.',
  },
  { selector: 'ClassExpression', message: 'Use plain functions and types instead of classes.' },
  {
    selector: "CallExpression[callee.property.name='then']",
    message: 'Use async/await instead of .then() chains.',
  },
  {
    selector: "CallExpression[callee.property.name='reduce']",
    message:
      'Use a for...of loop. reduce is only for simple sums (disable this line with a reason).',
  },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: 'Use for...of instead of forEach.',
  },
  { selector: 'TSAnyKeyword', message: 'Do not use any. Use unknown and narrow it.' },
  {
    selector:
      'ImportDeclaration[source.value=/^(fs|fs\\u002Fpromises|path|url|crypto|os|stream|util|events|child_process|worker_threads|http|https|zlib)$/]',
    message: 'Import Node built-ins with the node: prefix.',
  },
];

/** The readability limits from docs/STYLE.md. */
const readabilityLimits = {
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 3],
  'no-nested-ternary': 'error',
  'id-length': ['error', { min: 2, exceptions: ['i', 'j', 'k', '_'], properties: 'never' }],
};

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'fixtures/generated/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX, jsdoc },
    rules: {
      ...readabilityLimits,
      'no-restricted-syntax': ['error', ...bannedSyntax],
      'func-style': ['error', 'declaration', { allowArrowFunctions: false }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'start' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'import-x/no-default-export': 'error',
      'import-x/no-commonjs': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [{ pattern: '#**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
          contexts: ['ExportNamedDeclaration > TSTypeAliasDeclaration'],
        },
      ],
      'jsdoc/require-description': 'error',
      'jsdoc/no-types': 'error',
    },
  },
  {
    // Preact view components may be longer, since markup reads top to bottom.
    files: ['src/server/views/**/*.tsx', 'src/server/routes/pages/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Only originals.ts may touch the file system under a Reference root (see docs/ARCHITECTURE.md).
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    // The exceptions read the app's own folders (built assets, package.json, data), never a root.
    ignores: [
      'src/core/archive/originals.ts',
      'src/core/db/**',
      'src/core/jobs/**',
      'src/server/assets.ts',
      'src/server/config.ts',
      'src/server/main.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node:fs', message: 'Read originals through #core/archive/originals.js.' },
            {
              name: 'node:fs/promises',
              message: 'Read originals through #core/archive/originals.js.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests read best as one describe block per behavior; they keep the other rules.
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'max-lines-per-function': 'off',
      'jsdoc/require-jsdoc': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Tool config files must use a default export.
    files: ['*.config.js', '*.config.ts'],
    rules: { 'import-x/no-default-export': 'off' },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
