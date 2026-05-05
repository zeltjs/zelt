---
sidebar_position: 8
---

# Validation

Zelt uses [Valibot](https://valibot.dev/) for request validation, providing a type-safe and lightweight validation solution.

## Basic Usage

Use `validated()` with a Valibot schema to validate request bodies:

```typescript
import { Controller, Post, validated, response } from '@zeltjs/core';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(150))),
});

@Controller('/users')
export class UserController {
  @Post('/')
  create(body = validated(CreateUserSchema), res = response()) {
    // body is fully typed: { name: string; email: string; age?: number }
    return res.json({ id: '1', ...body }, 201);
  }
}
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
const schema = v.object({
  age: v.pipe(v.number(), v.minValue(0), v.maxValue(150)),
  price: v.pipe(v.number(), v.minValue(0)),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
```

### Array Validations

```typescript
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
