---
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

## Throwing HTTPExceptions

Use Hono's `HTTPException` to throw HTTP errors by specifying a status code and either a message or a custom response.

### Custom Message

For basic text responses, just set the error `message`:

```typescript
import { HTTPException } from '@zeltjs/core';

throw new HTTPException(401, { message: 'Unauthorized' });
```

### Custom Response

For JSON responses, or to set response headers, use the `res` option.

```typescript
import { HTTPException } from '@zeltjs/core';

const errorResponse = Response.json(
  { code: 'USER_NOT_FOUND', message: 'User not found' },
  { status: 404 }
);

throw new HTTPException(404, { res: errorResponse });
```

With custom headers:

```typescript
const errorResponse = new Response('Unauthorized', {
  status: 401,
  headers: {
    'WWW-Authenticate': 'Bearer error="invalid_token"',
  },
});

throw new HTTPException(401, { res: errorResponse });
```

### Cause

Use the `cause` option to attach the original error for debugging:

```typescript
try {
  await authorize(c);
} catch (cause) {
  throw new HTTPException(401, { message: 'Authorization failed', cause });
}
```

## Custom Error Codes

Define reusable error responses to maintain consistency across your API:

```typescript
import { HTTPException } from '@zeltjs/core';

const notFoundResponse = Response.json(
  { code: 'USER_NOT_FOUND', message: 'User not found' },
  { status: 404 }
);

const forbiddenResponse = Response.json(
  { code: 'FORBIDDEN', message: 'Access denied' },
  { status: 403 }
);

// Usage
throw new HTTPException(404, { res: notFoundResponse });
throw new HTTPException(403, { res: forbiddenResponse });
```

Or create a factory function:

```typescript
const createErrorResponse = (
  status: number,
  code: string,
  message: string
): Response => {
  return Response.json({ code, message }, { status });
};

// Usage
const response = createErrorResponse(404, 'USER_NOT_FOUND', 'User not found');
throw new HTTPException(404, { res: response });
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

## Custom Error Handlers

For more complex error handling logic, use the `@ErrorHandler` decorator to create reusable error handler classes.

### Creating an Error Handler

```typescript
import { ErrorHandler, RequestContext } from '@zeltjs/core';

@ErrorHandler
class DatabaseErrorHandler {
  onError(error: Error, c: RequestContext): Response | undefined {
    if (error.name === 'PrismaClientKnownRequestError') {
      return Response.json(
        { code: 'DATABASE_ERROR', message: 'Database operation failed' },
        { status: 409 }
      );
    }
    return undefined;
  }
}
```

The `onError` method receives:
- `error` — The thrown error
- `c` — The Hono request context

Return a `Response` to handle the error, or `undefined` to pass it to the next handler.

### Registering Error Handlers

Pass error handlers to `createHttpApp` via the `errorHandlers` option:

```typescript
import { createHttpApp } from '@zeltjs/core';

const app = createHttpApp({
  controllers: [UserController],
  middlewares: [LoggingMiddleware],
  errorHandlers: [DatabaseErrorHandler, ValidationErrorHandler],
});
```

### Handler Chain

Error handlers execute in the order they are registered:

1. First handler's `onError` is called
2. If it returns `undefined`, the next handler is called
3. If all handlers return `undefined`, the default error handler runs

```typescript
@ErrorHandler
class FirstHandler {
  onError(error: Error, c: RequestContext) {
    if (error instanceof CustomError) {
      return Response.json({ code: 'CUSTOM' }, { status: 400 });
    }
    return undefined;
  }
}

@ErrorHandler
class FallbackHandler {
  onError(error: Error, c: RequestContext) {
    console.error('Unhandled error:', error);
    return undefined;
  }
}

createHttpApp({
  controllers: [MyController],
  errorHandlers: [FirstHandler, FallbackHandler],
});
```

### Dependency Injection

Error handlers support dependency injection. Use constructor injection to access services:

```typescript
@ErrorHandler
class LoggingErrorHandler {
  constructor(private logger: LoggerService) {}

  onError(error: Error, c: RequestContext) {
    this.logger.error('Request failed', { error, path: c.req.path });
    return undefined;
  }
}
```

## Best Practices

1. **Use descriptive error codes** — Prefer `USER_NOT_FOUND` over `NOT_FOUND`
2. **Include actionable messages** — Help API consumers understand what went wrong
3. **Avoid exposing internal details** — In production, don't include stack traces or internal error messages
4. **Document error responses** — Use OpenAPI schemas to document all possible error codes
5. **Order error handlers by specificity** — Place specific handlers before generic ones
