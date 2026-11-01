// Stylelint setup. Colors and sizes live only in src/styles/tokens.css (docs/STYLE.md).
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
    'declaration-property-value-disallowed-list': {
      'border-radius': ['/^(?!0$).+/'],
      transition: ['/.+/'],
      animation: ['/.+/'],
      filter: ['/blur/'],
      'backdrop-filter': ['/.+/'],
    },
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
      { message: 'Use kebab-case class names (BEM-style __element and --modifier are allowed).' },
    ],
  },
  overrides: [
    {
      files: ['src/styles/tokens.css'],
      rules: { 'color-no-hex': null },
    },
  ],
};
