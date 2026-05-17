# @zeltjs/eslint-plugin

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

ESLint plugin for Zelt DI naming conventions.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install -D @zeltjs/eslint-plugin
```

## Usage

```javascript
// eslint.config.js
import zeltPlugin from '@zeltjs/eslint-plugin';

export default [
  {
    plugins: {
      '@zeltjs': zeltPlugin,
    },
    rules: {
      '@zeltjs/config-di-scope': 'error',
      '@zeltjs/decorator-file-naming': 'error',
    },
  },
];
```

## Rules

- `config-di-scope` - Enforce DI scope conventions in Config classes
- `decorator-file-naming` - Enforce decorator file naming conventions
