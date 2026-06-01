---
---

# Commands

Zelt provides CLI command support with dependency injection through `@zeltjs/core`.

## Creating a Command

Use the `@Command` decorator with `cliSchema()` and `args()` for type-safe CLI commands:

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';

@Command({
  name: 'greet',
  description: 'Greet a user',
})
export class GreetCommand {
  static schema = cliSchema({
    args: [{ name: 'name', type: 'string' }],
  });

  run(ctx = args(GreetCommand)) {
    console.log(`Hello, ${ctx.name}!`);
  }
}
```

## Configuration

Create a `src/cli.ts` entry point for your CLI:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet', description: 'Greet a user' })
class GreetCommand {
  static schema = cliSchema({ args: [{ name: 'name', type: 'string' }] });
  run(ctx = args(GreetCommand)) { console.log(`Hello, ${ctx.name}!`); }
}
// ---cut---
const app = createApp([command([GreetCommand])]);
const nodeApp = await onNode(app);
await nodeApp.execCommand([...nodeApp.args]);
```

Then configure `cli.entry` in your `zelt.config.ts`:

```typescript
import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  controllers: 'src/controllers/**/*.ts',
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

The `cliSchema()` function defines typed arguments and options:

### Positional Arguments

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
@Command({ name: 'copy' })
export class CopyCommand {
  static schema = cliSchema({
    args: [
      { name: 'source', type: 'string' },
      { name: 'destination', type: 'string' },
    ],
  });

  run(ctx = args(CopyCommand)) {
    console.log(`Copying ${ctx.source} to ${ctx.destination}`);
  }
}
```

### Options (Flags)

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
@Command({ name: 'build' })
export class BuildCommand {
  static schema = cliSchema({
    options: [
      { name: 'watch', type: 'boolean', alias: 'w' },
      { name: 'outDir', type: 'string', alias: 'o', default: 'dist' },
    ],
  });

  run(ctx = args(BuildCommand)) {
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
@Command({ name: 'deploy' })
export class DeployCommand {
  static schema = cliSchema({
    args: [
      { name: 'environment', type: 'string' },
    ],
    options: [
      { name: 'dryRun', type: 'boolean' },
      { name: 'tag', type: 'string' },
    ],
  });

  run(ctx = args(DeployCommand)) {
    const { environment, dryRun, tag } = ctx;

    if (dryRun) {
      console.log(`[DRY RUN] Would deploy to ${environment}`);
    } else {
      console.log(`Deploying ${tag ?? 'latest'} to ${environment}`);
    }
  }
}
```

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
@Command({ name: 'migrate' })
export class MigrateCommand {
  static schema = cliSchema({
    options: [
      { name: 'force', type: 'boolean' },
    ],
  });

  constructor(private readonly db = inject(DatabaseService)) {}

  async run(ctx = args(MigrateCommand)) {
    if (ctx.force) {
      console.log('Force migration enabled');
    }
    await this.db.runMigrations();
    console.log('Migrations completed');
  }
}
```

## Programmatic Execution

Commands can be executed programmatically using `onNode()`:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
@Command({ name: 'migrate' })
class MigrateCommand {
  static schema = cliSchema({ options: [{ name: 'force', type: 'boolean' }] });
  run(ctx = args(MigrateCommand)) {}
}
// ---cut---
const app = createApp([command([MigrateCommand])]);
const nodeApp = await onNode(app);

const result = await nodeApp.execCommand(['migrate', '--force']);
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
