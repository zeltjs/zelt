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

Add the `commands` option to your `zelt.config.ts`:

```typescript
import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  controllers: 'src/controllers/**/*.ts',
  commands: 'src/commands/**/*.ts',
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
static schema = cliSchema({
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
static schema = cliSchema({
  options: [
    { name: 'port', type: 'number', default: 3000 },
    { name: 'verbose', type: 'boolean' },  // defaults to false
  ],
});
```

## Dependency Injection

Commands support dependency injection:

```typescript
import { Command, cliSchema, args, inject } from '@zeltjs/core';
import { DatabaseService } from '../services/database.service';

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
import { createApp } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
import { MigrateCommand } from './commands/migrate.command';

const app = createApp({ commands: [MigrateCommand] });
const nodeApp = await onNode(app);

const result = await nodeApp.exec(['migrate', '--force']);
console.log(`Exit code: ${result.exitCode}`);
```

## Async Commands

Commands can be async:

```typescript
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
