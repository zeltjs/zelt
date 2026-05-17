# @zeltjs/openapi

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

OpenAPI schema generator for Zelt applications.

## Installation

```bash
npm install @zeltjs/openapi
```

## Usage

### CLI

```bash
npx zelt-openapi generate --config zelt.config.ts
```

### Programmatic

```typescript
import { generateOpenApiSpec } from '@zeltjs/openapi';

const spec = await generateOpenApiSpec({ controllers: [...] });
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
