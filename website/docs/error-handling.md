---
sidebar_position: 9
---

# Error Handling

Zelt provides a simple error handling mechanism based on Hono's `HTTPException`.

## Error Response Format

All errors are returned in a consistent JSON format:

```json
{
  "code": "ERROR_CODE",
  "message": "Error description"
}
```

## Built-in Error Types

### VALIDATION_FAILED

Returned when request body validation fails (status 400):

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

### INTERNAL_ERROR

Returned when an unhandled error occurs (status 500):

```json
{
  "code": "INTERNAL_ERROR",
  "message": "internal server error"
}
```

In development mode (`NODE_ENV=development`), the actual error message is included for debugging.

## Throwing HTTP Errors

Use Hono's `HTTPException` to throw custom HTTP errors:

```typescript
import { HTTPException } from 'hono/http-exception';
import { Controller, Get, pathParam } from '@zeltjs/core';

@Controller('/users')
export class UserController {
  @Get('/:id')
  findOne(id = pathParam('id')) {
    const user = findUser(id);
    
    if (!user) {
      throw new HTTPException(404, {
        res: Response.json(
          { code: 'USER_NOT_FOUND', message: `User ${id} not found` },
          { status: 404 }
        ),
      });
    }
    
    return user;
  }
}
```

## Custom Error Codes

Define your own error codes to maintain consistency across your API:

```typescript
const createError = (
  status: number,
  code: string,
  message: string
): HTTPException => {
  return new HTTPException(status, {
    res: Response.json({ code, message }, { status }),
  });
};

// Usage
throw createError(404, 'USER_NOT_FOUND', 'User not found');
throw createError(403, 'FORBIDDEN', 'Access denied');
throw createError(409, 'CONFLICT', 'Resource already exists');
```

## Error Schema for OpenAPI

Use the built-in error schemas to document error responses in your OpenAPI spec:

```typescript
import { errorBodySchema, validationErrorBodySchema } from '@zeltjs/core';
```

These schemas define the structure of error responses:

- `errorBodySchema` — Union of all error types (VALIDATION_FAILED | INTERNAL_ERROR)
- `validationErrorBodySchema` — Only the validation error type

## Error Handling Flow

```
Request
  │
  ▼
Middleware chain
  │
  ▼
Route handler ─── throws HTTPException ──► HTTPException.getResponse()
  │                                                │
  │                                                ▼
  │                                        Custom error response
  │
  ├─── throws Error ──► handleError()
  │                           │
  │                           ▼
  │                    500 INTERNAL_ERROR
  │
  ▼
Success response
```

## Best Practices

1. **Use descriptive error codes** — Prefer `USER_NOT_FOUND` over `NOT_FOUND`
2. **Include actionable messages** — Help API consumers understand what went wrong
3. **Avoid exposing internal details** — In production, don't include stack traces or internal error messages
4. **Document error responses** — Use OpenAPI schemas to document all possible error codes
