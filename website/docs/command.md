---
---

# Commands

Zelt provides CLI command support with dependency injection through `@zeltjs/core`.

:::info[Additional input schema features — not released]
See the [command input schema contract](./command-input-contract.md) for required options, variadic positional arguments, mutual exclusion through schema unions, rejection of undeclared input, and help generation. These additions are not included in `@zeltjs/core@0.11.0`.
:::

## Creating a Command

Define the schema with `cliSchema()` as a module-level constant, then pass it to `args()` in the `@Command` decorated class for type-safe CLI commands:

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';

const greetSchema = cliSchema({
  args: [{ name: 'name', type: 'string' }],
});

@Command({
  name: 'greet',
  description: 'Greet a user',
})
export class GreetCommand {
  run(ctx = args(greetSchema)) {
    console.log(`Hello, ${ctx.name}!`);
  }
}
```

## Configuration

Create a `src/cli.ts` entry point for your CLI:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

const greetSchema = cliSchema({ args: [{ name: 'name', type: 'string' }] });

@Command({ name: 'greet', description: 'Greet a user' })
class GreetCommand {
  run(ctx = args(greetSchema)) { console.log(`Hello, ${ctx.name}!`); }
}
// ---cut---
const app = createApp([command([GreetCommand])]);
const nodeApp = await onNode(app);
await nodeApp.commands.execCommand([...nodeApp.args]);
```

Then configure `cli.entry` in your `zelt.config.ts`:

```typescript
// @filename: src/app.ts
import { createApp, command } from '@zeltjs/core';

export const app = createApp([command([])]);

// @filename: zelt.config.ts
import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  cli: { entry: './src/cli.ts' },
});
```

## Running Commands

Use `zelt run` to execute commands:

```bash
# Run a command
zelt run greet Alice

# With custom config
zelt run -c ./config/zelt.config.ts greet Alice
```

## Schema Definition

The `cliSchema()` function defines typed arguments and options. The resulting schema is a plain value: declare it in its own module (for example `greet-schema.lib.ts`), import it into the command, and pass it to `args()`. The argv is parsed and validated when `args(schema)` is called. Undeclared options and excess positional arguments are rejected; input errors prevent entry into the `run()` body. Commands that never call `args()` are not automatically validated.

### Positional Arguments

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const copySchema = cliSchema({
  args: [
    { name: 'source', type: 'string' },
    { name: 'destination', type: 'string' },
  ],
});

@Command({ name: 'copy' })
export class CopyCommand {
  run(ctx = args(copySchema)) {
    console.log(`Copying ${ctx.source} to ${ctx.destination}`);
  }
}
```

### Options (Flags)

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const buildSchema = cliSchema({
  options: [
    { name: 'watch', type: 'boolean', alias: 'w' },
    { name: 'outDir', type: 'string', alias: 'o', default: 'dist' },
  ],
});

@Command({ name: 'build' })
export class BuildCommand {
  run(ctx = args(buildSchema)) {
    if (ctx.watch) {
      console.log('Watching for changes...');
    }
    console.log(`Output directory: ${ctx.outDir}`);
  }
}
```

```bash
# Usage
zelt run build --watch --outDir=out
zelt run build -w -o out
```

### Combined Arguments and Options

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const deploySchema = cliSchema({
  args: [
    { name: 'environment', type: 'string' },
  ],
  options: [
    { name: 'dryRun', type: 'boolean' },
    { name: 'tag', type: 'string' },
  ],
});

@Command({ name: 'deploy' })
export class DeployCommand {
  run(ctx = args(deploySchema)) {
    const { environment, dryRun, tag } = ctx;

    if (dryRun) {
      console.log(`[DRY RUN] Would deploy to ${environment}`);
    } else {
      console.log(`Deploying ${tag ?? 'latest'} to ${environment}`);
    }
  }
}
```

## Input Contracts and Help

An option with `required: true` requires explicit input and removes `undefined` from its inferred `string` or `number` type. A positional argument with `variadic: { min, max }` collects the remaining values into an array.

```ts
import { Command, args, cliSchema, formatCommandHelp } from '@zeltjs/core';

const analyzeSchema = cliSchema({
  args: [{ name: 'directories', type: 'string', variadic: { min: 1 } }],
  options: [{ name: 'guide', type: 'string', required: true }],
});

@Command({ name: 'analyze' })
class AnalyzeCommand {
  run(input = args(analyzeSchema)) {
    // directories: string[], guide: string
    console.log(input.directories, input.guide);
  }
}

console.log(formatCommandHelp('analyze', analyzeSchema));
```

`cliUnion([schemaA, schemaB, ...])` declares valid input alternatives. Exactly one schema must accept the entire input, and the inferred input type is also a union. See the [input schema contract](./command-input-contract.md) for exclusion examples, count boundaries, input errors, and help requirements.

## Schema Types

### Argument Types

| Type | Description |
|------|-------------|
| `string` | String value |
| `number` | Numeric value (automatically parsed) |

Arguments can be marked as optional:

```typescript
import { cliSchema } from '@zeltjs/core';
// ---cut---
const schema = cliSchema({
  args: [
    { name: 'file', type: 'string' },
    { name: 'count', type: 'number', optional: true },
  ],
});
```

### Option Types

| Type | Description |
|------|-------------|
| `string` | String option |
| `number` | Numeric option (automatically parsed) |
| `boolean` | Boolean flag |

Options can have defaults:

```typescript
import { cliSchema } from '@zeltjs/core';
// ---cut---
const schema = cliSchema({
  options: [
    { name: 'port', type: 'number', default: 3000 },
    { name: 'verbose', type: 'boolean' },  // defaults to false
  ],
});
```

## Transient Scope

Commands are registered as **transient** — a new instance is created for each execution. This ensures:

- Clean state for each command run
- No shared mutable state between executions
- Dependencies injected via `inject()` remain singletons

```typescript
import { Command, inject } from '@zeltjs/core';
declare class DatabaseService {}
// ---cut---
@Command({ name: 'process' })
export class ProcessCommand {
  private startTime = Date.now(); // Fresh for each execution

  constructor(private db = inject(DatabaseService)) {} // Singleton, shared

  run() {
    console.log(`Started at: ${this.startTime}`);
  }
}
```

## Dependency Injection

Commands support dependency injection:

```typescript
import { Command, cliSchema, args, inject } from '@zeltjs/core';
declare class DatabaseService { runMigrations(): Promise<void>; }
// ---cut---
const migrateSchema = cliSchema({
  options: [
    { name: 'force', type: 'boolean' },
  ],
});

@Command({ name: 'migrate' })
export class MigrateCommand {
  constructor(private readonly db = inject(DatabaseService)) {}

  async run(ctx = args(migrateSchema)) {
    if (ctx.force) {
      console.log('Force migration enabled');
    }
    await this.db.runMigrations();
    console.log('Migrations completed');
  }
}
```

### Where to Call `inject()` and `args()`

Call `inject()` in the constructor and `args()` as a default parameter of `run()`. The command context that `args()` reads from only exists while `run()` is executing, so calling `args()` in the constructor throws `ZeltContextNotAvailableError`.

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const greetSchema = cliSchema({ args: [{ name: 'name', type: 'string' }] });

@Command({ name: 'greet' })
export class GreetCommand {
  // ❌ No command context yet — throws ZeltContextNotAvailableError
  constructor(private readonly ctx = args(greetSchema)) {}

  run() {
    console.log(`Hello, ${this.ctx.name}!`);
  }
}
```

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const greetSchema = cliSchema({ args: [{ name: 'name', type: 'string' }] });

@Command({ name: 'greet' })
export class GreetCommand {
  // ✅ run() executes inside the command context
  run(ctx = args(greetSchema)) {
    console.log(`Hello, ${ctx.name}!`);
  }
}
```

## Programmatic Execution

Commands can be executed programmatically using `onNode()`:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

const migrateSchema = cliSchema({ options: [{ name: 'force', type: 'boolean' }] });

@Command({ name: 'migrate' })
class MigrateCommand {
  run(ctx = args(migrateSchema)) {}
}
// ---cut---
const app = createApp([command([MigrateCommand])]);
const nodeApp = await onNode(app);

const result = await nodeApp.commands.execCommand(['migrate', '--force']);
console.log(`Exit code: ${result.exitCode}`);
```

## Async Commands

Commands can be async:

```typescript
import { Command } from '@zeltjs/core';
// ---cut---
@Command({ name: 'sync' })
export class SyncCommand {
  async run() {
    console.log('Starting sync...');
    await this.fetchData();
    await this.processData();
    console.log('Sync completed');
  }

  private async fetchData() {
    // ...
  }

  private async processData() {
    // ...
  }
}
```
