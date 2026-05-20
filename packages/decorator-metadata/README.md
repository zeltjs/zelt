# @zeltjs/decorator-metadata

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Runtime decorator metadata capture and TypeScript type extraction for TC39 and legacy decorators.

## Why This Matters

Traditional decorator-based frameworks (NestJS, TypeORM, etc.) rely on:

- `reflect-metadata` polyfill
- `emitDecoratorMetadata` compiler flag
- `experimentalDecorators` (legacy TypeScript decorators)

These require **instantiating classes** to access metadata, which means:

- No tree-shaking (entire dependency graph loaded)
- Slow startup (all classes must be constructed)
- Non-standard (experimental features may break)

### The Static Layer Approach

This library introduces a **static layer** — metadata collection happens at module load time, *before* any instance is created:

```
┌─────────────────────────────────────────────────────────────┐
│  Traditional Approach                                       │
│  import → class definition → instantiation → metadata       │
│                                              ↑              │
│                                    (requires running app)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Static Layer Approach                                      │
│  import → class definition → metadata                       │
│                              ↑                              │
│                   (no instantiation needed)                 │
└─────────────────────────────────────────────────────────────┘
```

This enables:

| Capability | Traditional | Static Layer |
|------------|-------------|--------------|
| Tree-shaking | ❌ | ✅ |
| Static analysis (OpenAPI gen, CLI tools) | ❌ | ✅ |
| Cold start optimization | ❌ | ✅ |
| TC39 standard decorators | ❌ | ✅ |
| Legacy (`experimentalDecorators`) | ❌ | ✅ |

## Installation

```bash
pnpm add @zeltjs/decorator-metadata
```

## Usage

### Runtime API — `create*` (simple)

Create decorators that capture metadata at definition time:

```typescript
import {
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
} from '@zeltjs/decorator-metadata';

const Controller = (basePath: string) =>
  createClassDecorator({ decorator: 'Controller', basePath });

const Get = (path: string) =>
  createMethodDecorator({ decorator: 'Get', method: 'GET', path });

const Column = (opts?: { nullable?: boolean }) =>
  createPropertyDecorator({ decorator: 'Column', nullable: opts?.nullable ?? false });

@Controller('/users')
class UserController {
  @Get('/:id')
  getUser(id: string): User {
    // ...
  }
}
```

`createClassDecorator` / `createMethodDecorator` / `createPropertyDecorator` capture the source position via `Error.stack` at the moment the factory is called. They are thin shortcuts over `define*` (below).

**Note:** Decorator identifiers (e.g. `'Get'`, `'Column'`) are not captured automatically. Include a `decorator` field in `props` to distinguish between decorator types when reading metadata.

### Runtime API — `define*` (advanced, framework authors)

When you wrap `create*` inside your own helper, the captured source position points to the wrapper, not the user's code. Use `define*` to inject the position explicitly and to opt into additional behaviour:

```typescript
import {
  defineClassDecorator,
  defineMethodDecorator,
  definePropertyDecorator,
  getCallerPosition,
} from '@zeltjs/decorator-metadata';

// Custom framework-path filter so the stack walker skips your own wrapper.
const skipFrameworkFrames = (path: string) =>
  path.includes('/node_modules/') ||
  path.includes('/packages/my-framework/src/');

const Route = (method: 'GET' | 'POST', path: string) =>
  defineMethodDecorator(
    getCallerPosition({ isFrameworkPath: skipFrameworkFrames }),
    { decorator: 'Route', method, path },
    {
      // Throw a framework-specific error if applied to a static method.
      rejectStatic: () => new Error(`@${method} cannot decorate a static method`),
    },
  );

const Singleton = () =>
  defineClassDecorator(
    getCallerPosition({ isFrameworkPath: skipFrameworkFrames }),
    { decorator: 'Singleton' },
    {
      // Reject duplicate application (e.g. `@Singleton @Singleton class C {}`).
      rejectIfApplied: (existing) =>
        existing.some((p) => (p as { decorator?: string }).decorator === 'Singleton')
          ? new Error('@Singleton cannot be applied more than once')
          : undefined,
    },
  );
```

**`defineMethodDecorator` options:**

| Option | Type | Description |
|---|---|---|
| `rejectStatic` | `() => Error` | When provided, applying the decorator to a static method throws the returned error. |

**`defineClassDecorator` options:**

| Option | Type | Description |
|---|---|---|
| `rejectIfApplied` | `(existing: readonly object[]) => Error \| undefined` | Inspect props already attached to the class. Return an `Error` to abort, or `undefined` to proceed. Lets framework authors implement custom rules such as "no duplicate decorator name" without this package knowing the props shape. |

**`getCallerPosition` options:**

| Option | Type | Description |
|---|---|---|
| `isFrameworkPath` | `(path: string) => boolean` | Replaces the default filter (which skips `node_modules` and this package's own runtime). Return `true` for any path that should be considered framework code and skipped during stack walking. |

### Legacy decorator support

The same `create*` / `define*` factories work transparently with TypeScript's legacy `experimentalDecorators` syntax. Internally the package detects whether the second argument carries a TC39 `kind` field; otherwise it falls back to legacy semantics:

- **Class**: `(target)` — `cls.prototype` is used as the shared key for flushing pending method/field entries.
- **Method**: `(target, propertyKey, descriptor)` — `target` is the prototype for instance methods or the class itself for static methods; `isStatic` is derived from `typeof target`.
- **Field**: `(target, propertyKey)` — `target` is the prototype.

A legacy class decorator returns the original `target` (so existing decorator chains keep working); a TC39 class decorator returns `undefined` (so the original class is not replaced).

### Inspect API

Retrieve captured metadata without instantiating the class:

#### `getClassMetadata` (lightweight, no tsconfig)

Retrieves decorator metadata captured at runtime. No TypeScript compiler needed.

```typescript
import { getClassMetadata } from '@zeltjs/decorator-metadata/inspect';

const meta = getClassMetadata(UserController);
```

**Return Structure (`ClassMeta`):**

| Field | Type | Description |
|---|---|---|
| `pos` | `Position \| undefined` | Source position of the first applied class decorator. `undefined` if stack inspection failed (sandboxed runtimes). |
| `props` | `readonly object[]` | Props from every class decorator, in **application order** (innermost decorator first under TC39). |
| `methods` | `readonly MethodMeta[]` | Methods that have at least one decorator. |
| `properties` | `readonly PropertyMeta[]` | Properties that have at least one decorator. |

**`MethodMeta` / `PropertyMeta`:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Method or property name. Symbol-named members are currently ignored. |
| `pos` | `Position \| undefined` | Source position of the first decorator applied to this member. |
| `props` | `readonly object[]` | Props from every decorator applied to this member. **Each entry corresponds to one `@Decorator(...)` application** — arguments passed to a single application stay together inside that entry, they are not flattened across applications. |

**`Position`:**

| Field | Type | Description |
|---|---|---|
| `sourceFile` | `string` | Absolute path to source file. |
| `line` | `number` | 1-based line number. |
| `column` | `number` | 1-based column number. |

**Full Example:**

```typescript
// Source
@Controller('/users')
class UserController {
  @Get('/:id')
  getUser(id: string): User { /* ... */ }

  @Column({ nullable: true })
  cache?: Map<string, User>;
}

// Extracted metadata
{
  pos: { sourceFile: '/app/src/user.controller.ts', line: 1, column: 1 },
  props: [{ decorator: 'Controller', basePath: '/users' }],
  methods: [{
    name: 'getUser',
    pos: { sourceFile: '/app/src/user.controller.ts', line: 3, column: 3 },
    props: [{ decorator: 'Get', method: 'GET', path: '/:id' }],
  }],
  properties: [{
    name: 'cache',
    pos: { sourceFile: '/app/src/user.controller.ts', line: 6, column: 3 },
    props: [{ decorator: 'Column', nullable: true }],
  }],
}
```

Stacking multiple decorators on the same class or member appends to the same `props` array. For example, `@UseAuth @Controller('/x') class C {}` yields:

```typescript
meta.props === [
  { decorator: 'Controller', basePath: '/x' },  // innermost, evaluated first
  { decorator: 'UseAuth' },                     // outermost
]
```

**Note:** Returns `undefined` if the class has no decorator metadata.

#### `getTypeMetadata` (full type extraction, requires tsconfig)

Extracts full TypeScript type information using the compiler API.

```typescript
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

const result = await getTypeMetadata(UserController, {
  tsconfig: './tsconfig.json',
  expandStrategy: 'exported-only',
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `tsconfig` | `string` | `'./tsconfig.json'` | Path to tsconfig.json |
| `expandStrategy` | `ExpandStrategy` | `'exported-only'` | How to handle named types |

**Expand Strategies:**

| Strategy | Behavior |
|---|---|
| `'exported-only'` | Keep exported types as `{ kind: 'named' }` references, expand internal types inline |
| `'all-named'` | Keep all named types as references (most compact) |
| `'always'` | Expand all types inline (most detailed) |

**Extracted Type Kinds:**

| Kind | Example Source | Output |
|---|---|---|
| `primitive` | `string`, `number`, `boolean` | `{ kind: 'primitive', type: 'string' }` |
| `literal` | `'admin'`, `42`, `true` | `{ kind: 'literal', value: 'admin' }` |
| `array` | `string[]` | `{ kind: 'array', items: {...} }` |
| `union` | `string \| null` | `{ kind: 'union', types: [...] }` |
| `object` | `{ id: string }` | `{ kind: 'object', properties: [...] }` |
| `promise` | `Promise<User>` | `{ kind: 'promise', inner: {...} }` |
| `named` | `User` (exported type) | `{ kind: 'named', name: 'User', module: '...', isExported: true }` |
| `ref` | internal type reference | `{ kind: 'ref', name: 'InternalType' }` |

**Full Example:**

```typescript
// Source
export type User = { id: string; name: string; email?: string };

@Controller('/users')
class UserController {
  @Get('/:id')
  getUser(id: string): Promise<User | null> { /* ... */ }
}

// Extracted metadata
{
  name: 'UserController',
  pos: { sourceFile: '/app/src/user.controller.ts', line: 3, column: 1 },
  props: [{ decorator: 'Controller', basePath: '/users' }],
  methods: [{
    name: 'getUser',
    pos: { sourceFile: '/app/src/user.controller.ts', line: 5, column: 3 },
    props: [{ decorator: 'Get', method: 'GET', path: '/:id' }],
    params: [{ name: 'id', type: { kind: 'primitive', type: 'string' } }],
    returnType: {
      kind: 'union',
      types: [
        { kind: 'named', name: 'User', module: '/path/to/file.ts', isExported: true },
        { kind: 'primitive', type: 'null' },
      ],
    },
  }],
  properties: [],
}
```

## Use Cases

### OpenAPI Schema Generation

Generate OpenAPI specs without starting the server:

```typescript
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

const meta = await getTypeMetadata(UserController);
// → Convert to OpenAPI paths, no app.listen() required
```

### Validation Schema Generation

Auto-generate Zod/Valibot schemas from type information:

```typescript
const meta = await getTypeMetadata(CreateUserDto);
// → Generate validation schema from params/properties types
```

### CLI Tooling

Build framework-aware CLI tools that analyze code statically:

```typescript
// Scan all controllers, extract routes, generate documentation
// All without instantiating a single class
```

## Requirements

- TypeScript 5.0+
- Works with TC39 standard decorators (no `experimentalDecorators` required)
- Also supports legacy `experimentalDecorators` for incremental migration
- No `emitDecoratorMetadata`, no `reflect-metadata`

## License

MIT
