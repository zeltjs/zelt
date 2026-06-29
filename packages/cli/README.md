# @zeltjs/cli

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

CLI for the Zelt framework.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install -D @zeltjs/cli
```

## Usage

```bash
npx zelt build
npx zelt dev
```

## Configuration

Create a `zelt.config.ts` file:

```typescript
import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  // configuration options
});
```

### Custom build command

By default, `zelt build` uses tsdown. To use another builder, set `build.command`:

```typescript
import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  build: {
    command: 'vite build',
  },
});
```

`build.command` replaces the default tsdown build. It cannot be used together with a
plugin `build` hook, because both define the build implementation.

The command runs from the current working directory used to invoke `zelt build`.
Local binaries are resolved from `node_modules/.bin` in that directory and each
ancestor directory, so workspace-root binaries are available to package builds.
