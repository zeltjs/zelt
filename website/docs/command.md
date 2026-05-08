---
---

# Commands

Zelt provides `@zeltjs/command` package for building CLI commands with dependency injection support.

## Installation

```bash
pnpm add @zeltjs/command
```

## Creating a Command

Use the `@Command` decorator to define a CLI command:

```typescript
import { Command, type CommandContext } from '@zeltjs/command';

@Command({
  name: 'greet',
  description: 'Greet a user',
})
export class GreetCommand {
  args = {
    name: { type: 'positional' as const, description: 'Name to greet' },
  };

  run(ctx: CommandContext<typeof this.args>) {
    console.log(`Hello, ${ctx.args.name}!`);
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

## Arguments and Options

### Positional Arguments

```typescript
@Command({ name: 'copy' })
export class CopyCommand {
  args = {
    source: { 
      type: 'positional' as const,
      required: true,
      description: 'Source file path',
    },
    destination: {
      type: 'positional' as const,
      required: true,
      description: 'Destination file path',
    },
  };

  run(ctx: CommandContext<typeof this.args>) {
    console.log(`Copying ${ctx.args.source} to ${ctx.args.destination}`);
  }
}
```

### Options (Flags)

```typescript
@Command({ name: 'build' })
export class BuildCommand {
  options = {
    watch: {
      type: 'boolean' as const,
      alias: 'w',
      default: false,
      description: 'Watch for changes',
    },
    outDir: {
      type: 'string' as const,
      alias: 'o',
      default: 'dist',
      description: 'Output directory',
    },
  };

  run(ctx: CommandContext<Record<string, never>, typeof this.options>) {
    if (ctx.options.watch) {
      console.log('Watching for changes...');
    }
    console.log(`Output directory: ${ctx.options.outDir}`);
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
  args = {
    environment: {
      type: 'positional' as const,
      required: true,
      description: 'Target environment (staging, production)',
    },
  };

  options = {
    dryRun: {
      type: 'boolean' as const,
      default: false,
      description: 'Simulate deployment without making changes',
    },
    tag: {
      type: 'string' as const,
      description: 'Docker image tag to deploy',
    },
  };

  run(ctx: CommandContext<typeof this.args, typeof this.options>) {
    const { environment } = ctx.args;
    const { dryRun, tag } = ctx.options;

    if (dryRun) {
      console.log(`[DRY RUN] Would deploy to ${environment}`);
    } else {
      console.log(`Deploying ${tag ?? 'latest'} to ${environment}`);
    }
  }
}
```

## Dependency Injection

Commands support dependency injection, allowing you to use services:

```typescript
import { Command, type CommandContext } from '@zeltjs/command';
import { inject } from '@zeltjs/core';
import { DatabaseService } from '../services/database.service';

@Command({ name: 'migrate' })
export class MigrateCommand {
  constructor(private readonly db = inject(DatabaseService)) {}

  async run(ctx: CommandContext) {
    await this.db.runMigrations();
    console.log('Migrations completed');
  }
}
```

## Type Inference

The `CommandContext` type automatically infers argument and option types:

```typescript
@Command({ name: 'example' })
export class ExampleCommand {
  args = {
    file: { type: 'positional' as const, required: true },
    count: { type: 'positional' as const, default: '10' },
  };

  options = {
    verbose: { type: 'boolean' as const, default: false },
    format: { type: 'string' as const },
  };

  run(ctx: CommandContext<typeof this.args, typeof this.options>) {
    // ctx.args.file: string (required)
    // ctx.args.count: string (has default)
    // ctx.options.verbose: boolean (has default)
    // ctx.options.format: string | undefined (optional)
  }
}
```

## Async Commands

Commands can be async:

```typescript
@Command({ name: 'sync' })
export class SyncCommand {
  async run(ctx: CommandContext) {
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
