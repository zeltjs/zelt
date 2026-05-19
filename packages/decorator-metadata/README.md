# @zeltjs/decorator-metadata

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Runtime decorator metadata capture and TypeScript type extraction for TC39 decorators.

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

## Installation

```bash
pnpm add @zeltjs/decorator-metadata
```

## Usage

### Runtime API

Create decorators that capture metadata at definition time:

```typescript
import {
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
} from '@zeltjs/decorator-metadata';

const Controller = (basePath: string) =>
  createClassDecorator({ basePath });

const Get = (path: string) =>
  createMethodDecorator({ decorator: 'Get', method: 'GET', path });

const Post = (path: string) =>
  createMethodDecorator({ decorator: 'Post', method: 'POST', path });

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

**Note:** Decorator names (e.g., `@Get`, `@Column`) are not automatically captured. If you need to distinguish between decorator types, include an identifier in `props` (e.g., `{ decorator: 'Get', ... }`).

### Inspect API

Retrieve captured metadata without instantiating:

#### getClassMetadata (lightweight, no tsconfig)

Retrieves decorator metadata captured at runtime. No TypeScript compiler needed.

```typescript
import { getClassMetadata } from '@zeltjs/decorator-metadata/inspect';

const meta = getClassMetadata(UserController);
```

**Signature:**

```typescript
getClassMetadata(cls: object): ClassMeta | undefined
```

**Return Type:**

```typescript
type ClassMeta = {
  pos: Position;                // Where the class decorator was applied
  props: object;                // Props passed to createClassDecorator
  methods: MethodMeta[];        // Methods with decorators
  properties: PropertyMeta[];   // Properties with decorators
};

type MethodMeta = {
  name: string;                 // Method name
  pos: Position;                // Where the method decorator was applied
  props: object;                // Props passed to createMethodDecorator
};

type PropertyMeta = {
  name: string;                 // Property name
  pos: Position;                // Where the property decorator was applied
  props: object;                // Props passed to createPropertyDecorator
};

type Position = {
  sourceFile: string;           // Absolute path to source file
  line: number;                 // Line number (1-based)
  column: number;               // Column number (1-based)
};
```

**Example:**

```typescript
// Source
@Controller('/users')
class UserController {
  @Get('/:id')
  getUser(id: string): User { ... }
  
  @Column({ nullable: true })
  cache?: Map<string, User>;
}

// Result
{
  pos: { sourceFile: '/app/src/user.controller.ts', line: 1, column: 1 },
  props: { basePath: '/users' },
  methods: [{
    name: 'getUser',
    pos: { sourceFile: '/app/src/user.controller.ts', line: 3, column: 3 },
    props: { method: 'GET', path: '/:id' }
  }],
  properties: [{
    name: 'cache',
    pos: { sourceFile: '/app/src/user.controller.ts', line: 6, column: 3 },
    props: { nullable: true }
  }]
}
```

**Note:** Returns `undefined` if the class has no decorator metadata.

#### getTypeMetadata (full type extraction, requires tsconfig)

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
|--------|------|---------|-------------|
| `tsconfig` | `string` | `'./tsconfig.json'` | Path to tsconfig.json |
| `expandStrategy` | `ExpandStrategy` | `'exported-only'` | How to handle named types |

**Expand Strategies:**

| Strategy | Behavior |
|----------|----------|
| `'exported-only'` | Keep exported types as `{ kind: 'named' }` references, expand internal types inline |
| `'all-named'` | Keep all named types as references (most compact) |
| `'always'` | Expand all types inline (most detailed) |

**Extracted Type Kinds:**

| Kind | Example Source | Output |
|------|----------------|--------|
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
  getUser(id: string): Promise<User | null> { ... }
}

// Extracted metadata
{
  name: 'UserController',
  props: { basePath: '/users' },
  methods: [{
    name: 'getUser',
    props: { method: 'GET', path: '/:id' },
    params: [{ name: 'id', type: { kind: 'primitive', type: 'string' } }],
    returnType: {
      kind: 'union',
      types: [
        { kind: 'named', name: 'User', module: '/path/to/file.ts', isExported: true },
        { kind: 'primitive', type: 'null' }
      ]
    }
  }],
  properties: []
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

- TypeScript 5.0+ (TC39 decorators)
- No `experimentalDecorators`
- No `emitDecoratorMetadata`
- No `reflect-metadata`

## License

MIT
