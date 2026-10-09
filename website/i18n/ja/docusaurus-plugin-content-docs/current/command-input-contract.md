---
title: Command入力schemaの契約
---

# Command入力schemaの契約

:::info[実装済み・未リリース]
この文書は、今回実装したCommand入力schemaの契約です。これらの追加機能は `@zeltjs/core@0.11.0` には含まれていません。使い方の概要は[コマンド](./command.md)を参照してください。
:::

利用者は入力の契約を一度schemaに宣言します。Zeltはその宣言から入力の検証、TypeScriptの入力型、ヘルプを導きます。追加したAPIも `@zeltjs/core` から提供し、宣言・パース・型推論・検証・ヘルプ生成はZeltで実装しています。

## schemaを渡して入力を受け取る {#receiving-input}

既存の `cliSchema({ args, options })` の書き方を拡張します。schemaはモジュールレベルの定数にし、`run()` のデフォルト引数で `args(schema)` に渡します。

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

HTTPの `request(schema)` と同じく、schemaを渡すことで入力型が推論されます。`@Command` へのschemaの二重登録や、`run()` の入力型の手書きは要求しません。constructorでの `inject()` による依存性の注入も維持します。

## 必須オプション {#required-options}

`required: true` は、そのオプションをコマンドラインで明示する契約です。長い名前と `alias` のどちらで指定しても条件を満たします。省略された場合、`args(schema)` は入力を返しません。

| 宣言 | 未指定時 | 推論される型 |
| --- | --- | --- |
| `type: 'string'` | `undefined` | `string \| undefined` |
| `type: 'string', required: true` | 入力エラー | `string` |
| `type: 'number'` | `undefined` | `number \| undefined` |
| `type: 'number', required: true` | 入力エラー | `number` |
| `type: 'boolean'` | `false` | `boolean` |
| `type: 'boolean', required: true` | 入力エラー | `boolean` |
| `type: 'string', default: 'main'` | `'main'` | `string` |
| `type: 'number', default: 3000` | `3000` | `number` |
| `type: 'boolean', default: true` | `true` | `boolean` |

文字列・数値オプションは、名前を指定しても値がなければ入力エラーです。数値に変換できない値や有限でない数値も拒否します。空文字列を明示した文字列オプションは、指定済みとして扱います。文字列の長さや数値の範囲などの業務上の検証は、この必須条件に含みません。

上の `checkGuideSchema` に対する契約は次のとおりです。

| コマンドへの入力 | 結果 |
| --- | --- |
| `check-guide --snapshot snapshot.json --guide guide.json` | `{ snapshot: 'snapshot.json', guide: 'guide.json' }` |
| `check-guide --guide guide.json --snapshot snapshot.json` | 同じ入力値を受け取る |
| `check-guide --snapshot snapshot.json` | 必須の `--guide` がないため拒否 |
| `check-guide --snapshot snapshot.json --guide` | `--guide` の値がないため拒否 |
| `check-guide --snapshot snapshot.json --guide guide.json extra` | 宣言していない位置引数のため拒否 |

**契約:** `required: true` と `default` の併用は、schemaの宣言エラーにします。明示指定を求める契約と、省略時に値を補う契約を一つのオプションに重ねません。`required: true` のない既存のデフォルト値の扱いは維持します。

## 可変長位置引数 {#variadic-arguments}

`variadic: { min, max }` は、残りの位置引数を配列として受け取る契約です。

```ts
import { cliSchema } from '@zeltjs/core';

const analyzeSchema = cliSchema({
  args: [
    {
      name: 'directories',
      type: 'string',
      variadic: { min: 1 },
      description: '解析対象のディレクトリ',
    },
  ],
});
```

```bash
pathdency src packages/a packages/b
```

この入力から `{ directories: ['src', 'packages/a', 'packages/b'] }` を受け取ります。配列の順序は入力順です。

| 宣言 | 許可する個数 | 未指定時 | 推論される型 |
| --- | --- | --- | --- |
| `type: 'string', variadic: { min: 0 }` | 0個以上 | `[]` | `string[]` |
| `type: 'string', variadic: { min: 1 }` | 1個以上 | 入力エラー | `string[]` |
| `type: 'number', variadic: { min: 1, max: 3 }` | 1〜3個 | 入力エラー | `number[]` |

配列の個数は実行時に検証します。`min` や `max` からタプル型は生成しません。数値の可変長引数では、各要素を変換・検証し、一つでも不正なら入力全体を拒否します。

**契約:** `min` の省略は `0`、`max` の省略は上限なしとします。

宣言には次の条件があります。

- 可変長引数は、一つのschemaに一つだけ、`args` の最後に置きます。その前には固定の位置引数を置けます。
- `min` と `max` は0以上の有限の整数です。両方ある場合は `min <= max` が必要です。
- 可変長引数には `optional: true` を併用しません。0個を許可する場合は `min: 0` と書きます。
- `variadic` のない位置引数は既存どおり単一の値です。省略可否は `optional: true` で指定します。

固定の位置引数を宣言順に割り当て、その後に残った値を可変長引数に渡します。可変長引数の `min` を満たすために、前の固定引数を飛ばして割り当て直すことはありません。

たとえば `variadic: { min: 1, max: 3 }` なら、0個・4個は拒否し、1個・3個は受理します。上限を超えた値を捨てたり、配列を切り詰めたりしません。

## 有効な入力をunionで宣言する {#schema-unions}

入力同士の排他は、受け付ける入力の形を別々のschemaにして `cliUnion()` に渡します。

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

### 枝の選択 {#branch-selection}

各枝は、コマンド名を除く**入力全体**に対して検証します。別の枝に宣言されていても、現在の枝にない入力を受け入れません。枝の宣言をまとめてパースしたり、受理できた部分だけを返したりしません。

| コマンドへの入力 | 結果 |
| --- | --- |
| `serve --snapshot saved.json` | snapshotの枝。`snapshot` は `'saved.json'` |
| `serve src packages/a` | directoriesの枝。`directories` は `['src', 'packages/a']` |
| `serve src --base main` | directoriesの枝。`base` は `'main'` |
| `serve --config pathdency.json --base main` | configの枝。`config` と `base` を受け取る |
| `serve` | directoriesの枝。`directories` は `[]`、`base` は `undefined` |
| `serve --base main` | directoriesの枝。`directories` は `[]`、`base` は `'main'` |
| `serve --snapshot saved.json --base main` | どの枝も入力全体を受理できないため拒否 |
| `serve --snapshot saved.json src` | 同上 |
| `serve src --config pathdency.json` | 同上 |
| `serve --snapshot saved.json --config pathdency.json` | 同上 |
| `serve --snapshop saved.json` | 宣言していないオプションのため拒否 |

オプションの順序を入れ替えても、同じ組み合わせの受理・拒否は変わりません。

**契約:** 入力全体を受理する枝が一つだけの場合に成功します。0個なら入力エラー、複数なら曖昧な入力として拒否します。配列の先頭の枝を優先する規則は設けません。たとえば、省略可能なオプションしかない二つのschemaをunionにすると、空の入力は両方に一致するため拒否します。枝の順番を入れ替えても、結果は変わりません。

デフォルト値は、その枝の未指定オプションだけに適用します。ある枝が失敗したことで別の枝に値が混ざることはありません。snapshotの枝を受理した場合、解析の枝の `base` にデフォルト値が宣言されていても、結果に `base` は追加しません。デフォルト値だけで `required: true` を満たすこともありません。

### 推論される入力型 {#inferred-input-type}

`args(serveSchema)` は、各枝の入力型のunionを返します。各枝にない項目は `?: never` として型に表し、選ばれた枝の結果にその項目を追加しません。上の例の推論結果は次の形です。

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

この型は説明用です。利用者が定義して `run()` に付ける必要はありません。`InferSchema<typeof serveSchema>` でも同じ型を取得できます。`mode` など、schemaに宣言していない識別子は自動で追加しません。

## 宣言外の入力は拒否する {#undeclared-input}

`cliSchema()` と `cliUnion()` は、未知のオプションと余分な位置引数を常に拒否します。`strict` の切り替えは設けません。

| 入力 | 契約 |
| --- | --- |
| 宣言したオプション名・alias | 宣言した型と必須条件で検証する |
| 宣言していない長いオプション・alias | 値の有無によらず拒否する |
| 固定の位置引数の個数を超える入力 | 拒否する |
| 可変長引数の `max` を超える入力 | 拒否する |
| `--` より後のトークン | 位置引数として扱い、同じ型・個数の検証を行う |

たとえば `cliSchema({})` は空の入力だけを受理し、`--unknown` や位置引数を拒否します。単一の位置引数だけを宣言したschemaで `first second` を渡すと、二つ目を捨てずに拒否します。

`args(schema)` を `run()` のデフォルト引数に置いた場合、入力エラーなら `run()` の本体には入りません。`execCommand()` は既存の失敗結果である `exitCode: 1` と `ZeltCommandExecutionError`（`context.reason: 'argv_parse_error'`）を返します。利用者が必須・個数・排他・未知名の検証を `run()` に書き足す必要はありません。

エラーの説明では、不足したオプション名、不正な値、許可する個数と渡された個数、受理できない入力の組み合わせなど、修正に必要な原因を示します。unionの失敗を「一致する枝がない」だけで終わらせません。説明文の完全一致は契約に含めません。

この契約は `args(schema)` に渡した入力の検証を対象にします。`args()` を呼ばないcommandへのschemaの自動適用は、この契約に含めません。

## ヘルプも同じschemaから導く {#help}

ヘルプには、宣言した名前、alias、型、description、必須・省略可、デフォルト値、可変長の個数を反映します。unionでは入力の選択肢ごとにusageを表示し、別の枝の入力を自由に混ぜられるようには表示しません。

```text
Usage:
  check-guide --snapshot <snapshot> --guide <guide>

Usage:
  serve --snapshot <snapshot>
  serve [directories...] [--base <base>]
  serve --config <config> [--base <base>]
```

`<directories...>` は1個以上、`[directories...]` は0個以上を表します。たとえば `min: 1, max: 3` なら、usageに加えて「1〜3個」を記載します。選択肢ごとに入力できるオプションと必須条件を読み取れることを契約とし、空白や装飾は固定しません。

`formatCommandHelp(commandName, schema)` は、同じschemaからヘルプの文字列を返します。引数をパースしたり、コマンドを実行したり、標準出力へ書き込んだりしません。`--help` の自動処理は追加していません。

```ts
import { cliSchema, formatCommandHelp } from '@zeltjs/core';

const schema = cliSchema({
  args: [{ name: 'directories', type: 'string', variadic: { min: 1, max: 3 } }],
});
console.log(formatCommandHelp('pathdency', schema));
```

## schema宣言の整合性 {#schema-validity}

利用者の入力エラーと、開発者のschema宣言エラーは区別します。宣言エラーのschemaで入力を受理してはいけません。

- 同じ枝で、出力に使う `name` が位置引数・オプションを通して重複しないこと。
- 同じ枝で、オプション名・aliasが別のオプション名・aliasと衝突しないこと。
- `type` と `default` の型が一致すること。
- `required` と `default`、可変長引数の配置・個数・`optional` が上記の条件を満たすこと。
- `cliUnion()` の選択肢が二つ以上あること。別の枝で同じ名前やaliasを使うことは許可する。

リテラルから判定できる不整合は、可能な限りTypeScriptで拒否します。動的な値からschemaを作った場合も、同じ宣言条件を実行時に検証します。`cliSchema()`、`cliUnion()`、`formatCommandHelp()` は、宣言エラーの場合に `ZeltAppConfigurationError`（`context.reason: 'invalid_command_schema'`）をthrowします。名前・aliasの重複や可変長引数の配置はリテラルから型検査し、数値の境界は実行時に検証します。

## 実装した仕様と範囲 {#review}

契約として実装した仕様は、次の四点です。

1. `required: true` と `default` の併用を宣言エラーにする。
2. 可変長引数は `min` の省略を0、`max` の省略を上限なしとし、型は配列のままにする。
3. unionで複数の枝に一致する入力を拒否し、宣言順による優先順位を設けない。
4. `cliUnion()` には二つ以上のschemaを渡す。

`run(input = args(schema))` の書き方とconstructorでのDIを維持しています。`--help` の自動処理や、schemaを使わないcommandへの自動検証は追加していません。
