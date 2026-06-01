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
import { HTTPException } from '@zeltjs/core';
// ---cut---
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
import { Middleware, HTTPException, type RequestContext, type Next } from '@zeltjs/core';

async function authorize(c: RequestContext): Promise<void> {
  const token = c.req.header('Authorization');
  if (!token) throw new Error('No token');
}

@Middleware
class AuthMiddleware {
// ---cut---
  async use(c: RequestContext, next: Next) {
    try {
      await authorize(c);
    } catch (cause) {
      throw new HTTPException(401, { message: 'Authorization failed', cause });
    }
    await next();
    return undefined;
  }
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
import { HTTPException } from '@zeltjs/core';
// ---cut---
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

## Error Types for OpenAPI

Use the built-in error types to document error responses in your OpenAPI spec:

```typescript
import type { ErrorBody, ValidationErrorBody } from '@zeltjs/core';
```

These types define the structure of error responses:

- `ErrorBody` — Union of all error types (VALIDATION_FAILED | INTERNAL_ERROR)
- `ValidationErrorBody` — Only the validation error type

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

Pass error handlers to `createApp` via the `errorHandlers` option:

```typescript
import { createApp, Controller, Get, ErrorHandler, RequestContext, http } from '@zeltjs/core';

@Controller('/users') class UserController { @Get('/') findAll() { return { users: [] }; } }
@ErrorHandler class DatabaseErrorHandler { onError(error: Error, c: RequestContext) { return undefined; } }
@ErrorHandler class ValidationErrorHandler { onError(error: Error, c: RequestContext) { return undefined; } }
// ---cut---
const app = createApp([http({
    controllers: [UserController],
    errorHandlers: [DatabaseErrorHandler, ValidationErrorHandler],
  })]);
```

### Handler Chain

Error handlers execute in the order they are registered:

1. First handler's `onError` is called
2. If it returns `undefined`, the next handler is called
3. If all handlers return `undefined`, the default error handler runs

```typescript
import { createApp, Controller, Get, ErrorHandler, RequestContext, http } from '@zeltjs/core';

class CustomError extends Error {}
@Controller('/') class MyController { @Get('/') index() { return { ok: true }; } }
// ---cut---
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

createApp([http({
    controllers: [MyController],
    errorHandlers: [FirstHandler, FallbackHandler],
  })]);
```

### Dependency Injection

Error handlers support dependency injection. Use constructor injection to access services:

```typescript
import { ErrorHandler, RequestContext, inject } from '@zeltjs/core';
declare class LoggerService { error(msg: string, ctx: object): void; }
// ---cut---
@ErrorHandler
class LoggingErrorHandler {
  constructor(private logger = inject(LoggerService)) {}

  onError(error: Error, c: RequestContext) {
    this.logger.error('Request failed', { error, path: c.req.path });
    return undefined;
  }
}
```

## Framework Error Classes

Zelt provides structured error classes for framework-level errors. These classes follow a consistent naming convention (`Zelt*Error`) and include typed context for debugging:

| Error Class | Description |
|------------|-------------|
| `ZeltDecoratorUsageError` | Invalid decorator usage (e.g., applied to static method) |
| `ZeltLifecycleStateError` | Invalid lifecycle state (e.g., calling method after shutdown) |
| `ZeltContextNotAvailableError` | Primitive called outside execution context |
| `ZeltAppConfigurationError` | Invalid app configuration |
| `ZeltRouteConfigurationError` | Invalid route configuration |
| `ZeltMiddlewareExecutionError` | Middleware execution error (e.g., next() called multiple times) |
| `ZeltNotImplementedError` | Method not implemented |
| `ZeltSchemaValidationError` | Invalid schema definition |

### Usage

```typescript
import { ZeltAppConfigurationError } from '@zeltjs/core';

try {
  // ...
} catch (error) {
  if (error instanceof ZeltAppConfigurationError) {
    console.log(error.context.reason); // 'no_http_or_commands' | 'duplicate_command'
  }
}
```

### Error Context

Each error class includes a `context` property with structured information:

```ts twoslash
// @noErrors
// Reason: type-only example without runtime code
// ZeltDecoratorUsageError context
type DecoratorUsageErrorContext = {
  decoratorName: string;
  reason: 'static_method' | 'missing_decorator';
  targetName?: string;
}

// ZeltLifecycleStateError context
type LifecycleStateErrorContext = {
  operation: string;
  currentState: 'disposed' | 'ready' | 'not_ready';
}
```

## Best Practices

1. **Use descriptive error codes** — Prefer `USER_NOT_FOUND` over `NOT_FOUND`
2. **Include actionable messages** — Help API consumers understand what went wrong
3. **Avoid exposing internal details** — In production, don't include stack traces or internal error messages
4. **Document error responses** — Use OpenAPI schemas to document all possible error codes
5. **Order error handlers by specificity** — Place specific handlers before generic ones
6. **Use framework errors** — Catch `Zelt*Error` classes to handle framework-specific issues
