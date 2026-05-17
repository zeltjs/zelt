# @zeltjs/openapi

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

OpenAPI schema generator for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

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
