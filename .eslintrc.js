/* eslint-env node */
module.exports = {
  env: {
    node: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'eslint-config-google'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    'quotes': [2, 'single', {
      avoidEscape: true,
    }],
    'max-len': ['error', {'code': 250}],
    'object-curly-spacing': 'off',
    'require-jsdoc': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/ban-ts-comment': 'off',
  },
};
