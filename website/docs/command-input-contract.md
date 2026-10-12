---
title: Command input schema contract
---

# Command input schema contract

:::info[Implemented — not released]
This document describes the implemented command input schema contract. These additions are not included in `@zeltjs/core@0.11.0`. See [Commands](./command.md) for a usage overview.
:::

Declare the input contract once in a schema. Zelt derives input validation, TypeScript input types, and help from that declaration. The new APIs are also exported from `@zeltjs/core`. Zelt implements the declarations, parsing, type inference, validation, and help generation.

## Receive input through a schema {#receiving-input}

Extend the existing `cliSchema({ args, options })` declarations. Define the schema as a module-level constant and pass it to `args(schema)` in a default parameter of `run()`.

```ts
import { Command, args, cliSchema } from '@zeltjs/core';

const checkGuideSchema = cliSchema({
  options: [
    { name: 'snapshot', type: 'string', required: true },
    { name: 'guide', type: 'string', required: true },
  ],
});

@Command({ name: 'check-guide' })
export class CheckGuideCommand {
  run(input = args(checkGuideSchema)) {
    // input.snapshot: string
    // input.guide: string
    console.log(input.snapshot, input.guide);
  }
}
```

As with HTTP's `request(schema)`, passing the schema infers the input type. Users do not register the same schema again on `@Command` or annotate the input type of `run()` manually. Constructor dependency injection through `inject()` remains available.

## Required options {#required-options}

`required: true` requires the option to be explicitly supplied on the command line. Either its long name or its `alias` satisfies this requirement. If it is omitted, `args(schema)` does not return input.

| Declaration | When omitted | Inferred type |
| --- | --- | --- |
| `type: 'string'` | `undefined` | `string \| undefined` |
| `type: 'string', required: true` | Input error | `string` |
| `type: 'number'` | `undefined` | `number \| undefined` |
| `type: 'number', required: true` | Input error | `number` |
| `type: 'boolean'` | `false` | `boolean` |
| `type: 'boolean', required: true` | Input error | `boolean` |
| `type: 'string', default: 'main'` | `'main'` | `string` |
| `type: 'number', default: 3000` | `3000` | `number` |
| `type: 'boolean', default: true` | `true` | `boolean` |

A string or number option supplied without a value is an input error. Values that cannot be converted to a number, or produce a non-finite number, are also rejected. An explicitly supplied empty string counts as a supplied string option. Domain validation, such as string length or numeric ranges, is separate from this requirement.

The contract for `checkGuideSchema` above is:

| Command input | Result |
| --- | --- |
| `check-guide --snapshot snapshot.json --guide guide.json` | `{ snapshot: 'snapshot.json', guide: 'guide.json' }` |
| `check-guide --guide guide.json --snapshot snapshot.json` | The same input values |
| `check-guide --snapshot snapshot.json` | Rejected: required `--guide` is missing |
| `check-guide --snapshot snapshot.json --guide` | Rejected: `--guide` has no value |
| `check-guide --snapshot snapshot.json --guide guide.json extra` | Rejected: undeclared positional argument |

**Contract:** Combining `required: true` with `default` is a schema declaration error. Requiring explicit input and supplying a value when omitted are separate contracts. Existing defaults without `required: true` retain their behavior.

## Variadic positional arguments {#variadic-arguments}

`variadic: { min, max }` collects the remaining positional arguments into an array.

```ts
import { cliSchema } from '@zeltjs/core';

const analyzeSchema = cliSchema({
  args: [
    {
      name: 'directories',
      type: 'string',
      variadic: { min: 1 },
      description: 'Directories to analyze',
    },
  ],
});
```

```bash
pathdency src packages/a packages/b
```

This input produces `{ directories: ['src', 'packages/a', 'packages/b'] }`. Array elements preserve input order.

| Declaration | Allowed count | When omitted | Inferred type |
| --- | --- | --- | --- |
| `type: 'string', variadic: { min: 0 }` | Zero or more | `[]` | `string[]` |
| `type: 'string', variadic: { min: 1 }` | One or more | Input error | `string[]` |
| `type: 'number', variadic: { min: 1, max: 3 }` | One to three | Input error | `number[]` |

The count is validated at runtime. Zelt does not generate tuple types from `min` or `max`. Numeric variadic arguments convert and validate every element; one invalid element rejects the entire input.

**Contract:** Omitted `min` means `0`; omitted `max` means no upper limit.

Declarations satisfy these conditions:

- Each schema has at most one variadic argument, placed last in `args`. Fixed positional arguments may precede it.
- `min` and `max` are finite non-negative integers. When both are supplied, `min <= max`.
- A variadic argument cannot also have `optional: true`. Use `min: 0` to allow zero elements.
- Positional arguments without `variadic` remain single values. `optional: true` retains its existing meaning.

Assign fixed positional arguments in declaration order, then pass the remaining values to the variadic argument. Do not skip and reassign a preceding fixed argument to satisfy the variadic argument's `min`.

For example, `variadic: { min: 1, max: 3 }` rejects zero or four elements and accepts one or three. Excess input is neither discarded nor truncated.

## Declare valid inputs as a union {#schema-unions}

Express mutual exclusion by declaring each valid input shape as a separate schema and passing those schemas to `cliUnion()`.

```ts
import { Command, args, cliSchema, cliUnion } from '@zeltjs/core';

const snapshotSchema = cliSchema({
  options: [
    { name: 'snapshot', type: 'string', required: true },
  ],
});

const directoriesSchema = cliSchema({
  args: [
    { name: 'directories', type: 'string', variadic: { min: 0 } },
  ],
  options: [
    { name: 'base', type: 'string' },
  ],
});

const configSchema = cliSchema({
  options: [
    { name: 'config', type: 'string', required: true },
    { name: 'base', type: 'string' },
  ],
});

const serveSchema = cliUnion([
  snapshotSchema,
  directoriesSchema,
  configSchema,
]);

@Command({ name: 'serve' })
export class ServeCommand {
  run(input = args(serveSchema)) {
    if (input.snapshot !== undefined) {
      // input.snapshot: string
      console.log('snapshot', input.snapshot);
    } else if (input.config !== undefined) {
      // input.config: string
      // input.base: string | undefined
      console.log('config', input.config, input.base);
    } else {
      // input.directories: string[]
      // input.base: string | undefined
      console.log('directories', input.directories, input.base);
    }
  }
}
```

### Branch selection {#branch-selection}

Validate each branch against the **entire input**, excluding the command name. A branch rejects input undeclared in that branch, even when another branch declares it. Do not flatten branch declarations or return only the parts that parsed successfully.

| Command input | Result |
| --- | --- |
| `serve --snapshot saved.json` | Snapshot branch; `snapshot` is `'saved.json'` |
| `serve src packages/a` | Directories branch; `directories` is `['src', 'packages/a']` |
| `serve src --base main` | Directories branch; `base` is `'main'` |
| `serve --config pathdency.json --base main` | Config branch; returns `config` and `base` |
| `serve` | Directories branch; `directories` is `[]`, `base` is `undefined` |
| `serve --base main` | Directories branch; `directories` is `[]`, `base` is `'main'` |
| `serve --snapshot saved.json --base main` | Rejected: no branch accepts the entire input |
| `serve --snapshot saved.json src` | Same rejection |
| `serve src --config pathdency.json` | Same rejection |
| `serve --snapshot saved.json --config pathdency.json` | Same rejection |
| `serve --snapshop saved.json` | Rejected: undeclared option |

Reordering options does not change whether the same combination is accepted or rejected.

**Contract:** Exactly one branch must accept the entire input. Zero matching branches is an input error; multiple matching branches is an ambiguous input error. The first branch has no priority. For example, a union of two schemas containing only optional options rejects empty input because both branches match. Reordering branches does not change the result.

Defaults apply only to omitted options within their own branch. A failed branch never contributes values to another branch. If the snapshot branch is accepted, a default for `base` in an analysis branch is not added to the result. A default also cannot satisfy `required: true`.

### Inferred input type {#inferred-input-type}

`args(serveSchema)` returns the union of the branch input types. Properties absent from a branch are represented as `?: never` in its type and are not added to that branch's result. The example above infers this shape:

```ts
type ServeInput =
  | {
      snapshot: string;
      directories?: never;
      config?: never;
      base?: never;
    }
  | {
      directories: string[];
      base: string | undefined;
      snapshot?: never;
      config?: never;
    }
  | {
      config: string;
      base: string | undefined;
      snapshot?: never;
      directories?: never;
    };
```

This type is illustrative. Users do not need to declare it or annotate `run()` with it. `InferSchema<typeof serveSchema>` also produces the same type. No undeclared discriminator, such as `mode`, is added automatically.

## Reject undeclared input {#undeclared-input}

`cliSchema()` and `cliUnion()` always reject unknown options and excess positional arguments. There is no `strict` switch.

| Input | Contract |
| --- | --- |
| Declared option name or alias | Validate its declared type and required condition |
| Undeclared long option or alias | Reject, whether or not it has a value |
| Input exceeding the fixed positional argument count | Reject |
| Input exceeding a variadic argument's `max` | Reject |
| Tokens after `--` | Treat as positional arguments and apply the same type and count validation |

For example, `cliSchema({})` accepts only empty input and rejects `--unknown` or positional arguments. A schema declaring one positional argument rejects `first second` rather than discarding the second value.

When `args(schema)` is a default parameter of `run()`, an input error prevents entry into the method body. `execCommand()` returns the existing failure result: `exitCode: 1` and a `ZeltCommandExecutionError` with `context.reason: 'argv_parse_error'`. Users do not add required-option, count, exclusion, or unknown-name checks to `run()`.

Error descriptions identify causes needed to correct the input, such as a missing option name, an invalid value, allowed and supplied counts, or an incompatible input combination. A union error does not stop at "no matching branch." Exact wording is not part of the contract.

This contract covers validation through `args(schema)`. Automatically applying a schema to a command that never calls `args()` is outside this contract.

## Derive help from the same schema {#help}

Help reflects declared names, aliases, types, descriptions, required or optional inputs, defaults, and variadic counts. Unions show a separate usage alternative for each branch, rather than suggesting that inputs from different branches can be freely combined.

```text
Usage:
  check-guide --snapshot <snapshot> --guide <guide>

Usage:
  serve --snapshot <snapshot>
  serve [directories...] [--base <base>]
  serve --config <config> [--base <base>]
```

`<directories...>` means one or more elements; `[directories...]` means zero or more. For `min: 1, max: 3`, help also states "one to three elements." The contract requires users to see the available inputs and required conditions for each alternative. Whitespace and styling are not fixed.

`formatCommandHelp(commandName, schema)` returns a help string derived from the same schema. It does not parse input, execute the command, or write to stdout. Automatic handling of `--help` has not been added.

```ts
import { cliSchema, formatCommandHelp } from '@zeltjs/core';

const schema = cliSchema({
  args: [{ name: 'directories', type: 'string', variadic: { min: 1, max: 3 } }],
});
console.log(formatCommandHelp('pathdency', schema));
```

## Schema declaration validity {#schema-validity}

Distinguish user input errors from developer schema declaration errors. An invalid schema must not accept input.

- Output `name` values are unique across positional arguments and options within a branch.
- Option names and aliases do not collide with other option names or aliases within a branch.
- Each `default` matches its declared `type`.
- `required` with `default`, and variadic placement, counts, and `optional`, satisfy the conditions above.
- `cliUnion()` has at least two alternatives. Different branches may reuse names and aliases.

Reject inconsistencies detectable from literals in TypeScript wherever possible. Schemas built from dynamic values satisfy the same conditions, checked at runtime. `cliSchema()`, `cliUnion()`, and `formatCommandHelp()` throw `ZeltAppConfigurationError` with `context.reason: 'invalid_command_schema'` for declaration errors. Duplicate names or aliases and variadic placement are checked from literals in TypeScript; numeric bounds are checked at runtime.

## Implemented decisions and scope {#review}

The implemented contract includes these four decisions:

1. Combining `required: true` with `default` is a schema declaration error.
2. Omitted variadic `min` means zero and omitted `max` means no upper limit; inferred types remain arrays.
3. Multiple matching union branches are rejected, with no priority based on declaration order.
4. `cliUnion()` requires at least two schemas.

The existing `run(input = args(schema))` style and constructor DI are preserved. Automatic `--help` handling and automatic validation of commands that do not use a schema have not been added.
