---
---

# Validation

Zelt validates request bodies with synchronous Standard Schema compatible schemas. You can use any validator that exposes `schema["~standard"].validate(value)`, including [Valibot](https://valibot.dev/), Zod, and ArkType.

## Installation

`request()` is included in `@zeltjs/core`. Install the schema library you want to use:

```bash
pnpm add @zeltjs/core valibot
```

### With OpenAPI Generation

Runtime validation only requires Standard Schema. OpenAPI generation still needs a schema adapter when the schema does not expose Standard JSON Schema. For Valibot, use `@zeltjs/validator-valibot/openapi` and install `@valibot/to-json-schema`:

```bash
pnpm add @zeltjs/validator-valibot valibot @valibot/to-json-schema
```

:::tip[Version Compatibility]
`@valibot/to-json-schema` must match your `valibot` version. For example:
- `valibot@1.4.x` → `@valibot/to-json-schema@1.7.x`
- `valibot@1.3.x` → `@valibot/to-json-schema@1.6.x`

Check the [Valibot releases](https://github.com/fabian-hiller/valibot/releases) for compatibility.
:::

:::info[Important]
Import `request()` from `@zeltjs/core`. The Valibot package only provides the OpenAPI schema adapter.
The `valibot` peer dependency must be `^1.0.0`. We test against `1.3.x`; using an older version may cause type inference issues.
:::

## Basic Usage

Use `request()` with a Valibot schema to validate request bodies:

```typescript
import { Controller, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(150))),
});

@Controller('/users')
export class UserController {
  @Post('/')
  async create(req = request(CreateUserSchema), res = response()) {
    const body = await req.body();
    // body is fully typed: { name: string; email: string; age?: number }
    return res.json({ id: '1', ...body }, 201);
  }
}
```

## Form Data and File Uploads

Use `request(schema, { target: 'form' })` to validate `multipart/form-data` requests, including file uploads:

```typescript
import { Controller, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

const UploadSchema = v.object({
  file: v.instance(File),
  description: v.optional(v.string()),
});

@Controller('/upload')
export class UploadController {
  @Post('/')
  async upload(req = request(UploadSchema, { target: 'form' }), res = response()) {
    const body = await req.body();
    // body.file is a File object
    console.log(body.file.name, body.file.size, body.file.type);
    return res.json({ filename: body.file.name, size: body.file.size }, 201);
  }
}
```

### Target Options

The `target` option of `request()` specifies the request body format:

| Target | Content-Type | Use Case |
|--------|-------------|----------|
| `'json'` (default) | `application/json` | JSON API requests |
| `'form'` | `multipart/form-data`, `application/x-www-form-urlencoded` | File uploads, HTML forms |

### Multiple Files

```typescript
import { Controller, Post, request } from '@zeltjs/core';
import * as v from 'valibot';
// ---cut---
const MultiUploadSchema = v.object({
  files: v.array(v.instance(File)),
  category: v.string(),
});

@Controller('/upload')
class BulkUploadController {
  @Post('/bulk')
  async bulkUpload(req = request(MultiUploadSchema, { target: 'form' })) {
    const body = await req.body();
    for (const file of body.files) {
      console.log(file.name);
    }
    return { count: body.files.length };
  }
}
```

### OpenAPI Generation

When using `'form'` target, OpenAPI output automatically uses `multipart/form-data` as the content type:

```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        $ref: '#/components/schemas/UploadSchema'
```

## Validation Error Response

When validation fails, Zelt automatically returns a 400 response:

```json
{
  "code": "VALIDATION_FAILED",
  "issues": [
    {
      "kind": "validation",
      "type": "email",
      "message": "Invalid email",
      "path": ["email"]
    }
  ]
}
```

See [Error Handling](./error-handling.md) for more details on error responses.

## Common Validations

### String Validations

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  username: v.pipe(
    v.string(),
    v.minLength(3),
    v.maxLength(20),
    v.regex(/^[a-z0-9_]+$/i)
  ),
  email: v.pipe(v.string(), v.email()),
  url: v.pipe(v.string(), v.url()),
  uuid: v.pipe(v.string(), v.uuid()),
});
```

### Number Validations

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  age: v.pipe(v.number(), v.minValue(0), v.maxValue(150)),
  price: v.pipe(v.number(), v.minValue(0)),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
```

### Array Validations

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  tags: v.pipe(
    v.array(v.string()),
    v.minLength(1),
    v.maxLength(10)
  ),
  scores: v.array(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
});
```

### Optional and Nullable

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  required: v.string(),
  optional: v.optional(v.string()),
  nullable: v.nullable(v.string()),
  optionalNullable: v.optional(v.nullable(v.string())),
  withDefault: v.optional(v.string(), 'default value'),
});
```

### Nested Objects

```typescript
import * as v from 'valibot';
// ---cut---
const AddressSchema = v.object({
  street: v.string(),
  city: v.string(),
  country: v.string(),
  zipCode: v.optional(v.string()),
});

const UserSchema = v.object({
  name: v.string(),
  address: AddressSchema,
  alternateAddresses: v.optional(v.array(AddressSchema)),
});
```

## Type Inference

Valibot schemas provide automatic TypeScript type inference:

```typescript
import * as v from 'valibot';
// ---cut---
const UserSchema = v.object({
  name: v.string(),
  age: v.number(),
});

// Infer the type from schema
type User = v.InferOutput<typeof UserSchema>;
// Equivalent to: { name: string; age: number }
```

## Why Valibot?

- **Type-safe** — Full TypeScript support with automatic type inference
- **Lightweight** — Tree-shakeable, only includes what you use
- **Fast** — Optimized for runtime performance
- **Composable** — Build complex schemas from simple building blocks
