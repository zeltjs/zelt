---
---

# OpenAPI

Zelt automatically generates OpenAPI 3.1 specifications from your controllers — no decorators or annotations required.

## Overview

The `@zeltjs/openapi` package analyzes your controller method signatures at build time and generates a standard OpenAPI 3.1 specification.

## Installation

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="pkg-manager">
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @zeltjs/openapi
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @zeltjs/openapi
    ```
  </TabItem>
  <TabItem value="bun" label="bun">
    ```bash
    bun add @zeltjs/openapi
    ```
  </TabItem>
</Tabs>

### With the Valibot adapter

If you're generating schemas from Valibot, use `@zeltjs/validator-valibot/openapi` and install `@valibot/to-json-schema`:

<Tabs groupId="pkg-manager">
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @zeltjs/openapi @valibot/to-json-schema
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @zeltjs/openapi @valibot/to-json-schema
    ```
  </TabItem>
  <TabItem value="bun" label="bun">
    ```bash
    bun add @zeltjs/openapi @valibot/to-json-schema
    ```
  </TabItem>
</Tabs>

:::tip Version Compatibility
`@valibot/to-json-schema` must match your `valibot` version. See [Validation - Installation](./validation.md#installation) for details.
:::

## Configuration

Create a `zelt.config.ts` file in your project root:

```typescript
type OpenApiConfig = {
  controllers: string[];
  dist: string;
  tsconfig: string;
};
declare function defineConfig(config: OpenApiConfig): OpenApiConfig;
// ---cut---
export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',
});
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `controllers` | `string[]` | Glob patterns to find controller files |
| `dist` | `string` | Output directory for generated files |
| `tsconfig` | `string` | Path to tsconfig.json (required for OpenAPI generation) |

Controllers are automatically discovered by scanning files matching the glob patterns and detecting classes with `@Controller` decorator.

## Generating OpenAPI Spec

### One-time Build

```bash
pnpm zelt-openapi build
```

This generates `<dist>/openapi.json`.

### Watch Mode

```bash
pnpm zelt-openapi watch
```

Continuously regenerates when controllers change.

### npm Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "generate": "zelt-openapi build",
    "generate:watch": "zelt-openapi watch"
  }
}
```

## Generated openapi.json

Standard OpenAPI 3.1 specification:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "zelt app",
    "version": "0.0.0"
  },
  "paths": {
    "/hello/{name}": {
      "get": {
        "parameters": [...],
        "responses": {...}
      }
    }
  },
  "components": {
    "schemas": {...}
  }
}
```

## How It Works

Zelt uses a "zero-annotation" approach inspired by [Scramble](https://scramble.dedoc.co/):

1. **Static Analysis** — Analyzes controller method signatures at build time
2. **Type Extraction** — Extracts request/response types from TypeScript types
3. **Schema Generation** — Converts TypeScript types to JSON Schema for OpenAPI

This means your runtime code stays clean — no decorators or schema definitions needed beyond what you already write for validation.
