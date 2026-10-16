// Expo's flat config, as `npx expo lint` would generate it.
//
// `src/generated/` is written by `pnpm companion:sync` in the repository root
// and checked there for drift; linting or reformatting it here would make a
// clean sync look like a change.

const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', 'coverage/**', 'dist/**', 'src/generated/**'],
  },
  {
    // The files Node runs directly, the way Expo's own config already treats
    // metro.config.js.
    files: [
      '*.config.js',
      'jest.resolver.js',
      'resolution-guard.js',
      'scripts/**/*.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
      },
    },
  },
])
