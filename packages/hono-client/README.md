# @zeltjs/hono-client

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Generate type-safe Hono client types from Zelt controllers.

## Installation

```bash
npm install -D @zeltjs/hono-client
```

## Usage

### CLI

```bash
npx zelt-hono-client generate --config zelt.config.ts
```

### Plugin

```typescript
// zelt.config.ts
import { defineConfig } from '@zeltjs/cli';
import { honoClientPlugin } from '@zeltjs/hono-client';

export default defineConfig({
  plugins: [
    honoClientPlugin({
      output: './src/client.ts',
    }),
  ],
});
```

### Client

```typescript
import { hc } from 'hono/client';
import type { AppType } from './client';

const client = hc<AppType>('http://localhost:3000');
const res = await client.users.$get();
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
