// Compatibility lint for the extension: Chrome 88 is the minimum supported
// version (see manifest.json "minimum_chrome_version"). Parsing with
// ecmaVersion 2020 rejects any newer syntax; the restricted-property rules
// catch built-ins that shipped after Chrome 88.
'use strict';

const browserGlobals = {
  window: 'readonly', document: 'readonly', globalThis: 'readonly', self: 'readonly',
  chrome: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  requestAnimationFrame: 'readonly', MutationObserver: 'readonly', NodeFilter: 'readonly',
  Node: 'readonly', WeakMap: 'readonly', Set: 'readonly', Map: 'readonly', JSON: 'readonly',
  navigator: 'readonly', Blob: 'readonly', URL: 'readonly', module: 'writable', require: 'readonly',
  queueMicrotask: 'readonly', HTMLElement: 'readonly', Element: 'readonly', Text: 'readonly',
};

const newerThanChrome88 = [
  { property: 'at', message: 'Array/String.prototype.at needs Chrome 92+' },
  { object: 'Object', property: 'hasOwn', message: 'Object.hasOwn needs Chrome 93+' },
  { property: 'findLast', message: 'findLast needs Chrome 97+' },
  { property: 'findLastIndex', message: 'findLastIndex needs Chrome 97+' },
  { property: 'replaceAll', message: 'avoid replaceAll (Chrome 85+); use a global regex' },
  { property: 'toSorted', message: 'toSorted needs Chrome 110+' },
  { property: 'toReversed', message: 'toReversed needs Chrome 110+' },
  { property: 'toSpliced', message: 'toSpliced needs Chrome 110+' },
  { property: 'with', message: 'Array.prototype.with needs Chrome 110+' },
  { object: 'crypto', property: 'randomUUID', message: 'crypto.randomUUID needs Chrome 92+' },
  { object: 'Promise', property: 'any', message: 'Promise.any needs Chrome 85+; avoid' },
];

module.exports = [
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-restricted-properties': ['error', ...newerThanChrome88],
      'no-restricted-globals': ['error',
        { name: 'structuredClone', message: 'structuredClone needs Chrome 98+' },
        { name: 'AggregateError', message: 'AggregateError needs Chrome 85+; avoid' },
      ],
      'no-restricted-syntax': ['error',
        { selector: 'Literal[regex.flags=/d/]', message: 'RegExp d flag needs Chrome 90+' },
        { selector: 'Literal[regex.flags=/v/]', message: 'RegExp v flag needs Chrome 112+' },
      ],
    },
  },
];
