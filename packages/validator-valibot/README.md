# @zeltjs/validator-valibot

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Valibot OpenAPI schema adapter for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/validator-valibot valibot @valibot/to-json-schema @zeltjs/openapi
```

## Usage

```typescript
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';
import { generateOpenApi } from '@zeltjs/openapi';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

await generateOpenApi(app.http, {
  distDir: './openapi',
  schemaAdapter: valibotAdapter,
});
```
