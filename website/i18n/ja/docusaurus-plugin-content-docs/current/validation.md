---
---

# Validation

Zeltは、同期的なStandard Schema互換のschemaを使ってリクエストボディをバリデーションします。`schema["~standard"].validate(value)`を公開しているバリデータであれば、[Valibot](https://valibot.dev/)、Zod、ArkTypeを含め、どれでも使用できます。

## Installation {#installation}

`request()`は`@zeltjs/core`に含まれています。使用したいschemaライブラリをインストールしてください:

```bash
pnpm add @zeltjs/core valibot
```

### With OpenAPI Generation {#with-openapi-generation}

実行時のバリデーションにはStandard Schemaだけで十分です。schemaが標準JSON Schemaを公開していない場合、OpenAPI生成にはschemaアダプターが別途必要です。Valibotの場合は、`@zeltjs/validator-valibot/openapi`と`@valibot/to-json-schema`を使います:

```bash
pnpm add @zeltjs/validator-valibot valibot @valibot/to-json-schema
```

:::tip[バージョン互換性]
`@valibot/to-json-schema`は`valibot`のバージョンと一致させる必要があります。例:
- `valibot@1.4.x` → `@valibot/to-json-schema@1.7.x`
- `valibot@1.3.x` → `@valibot/to-json-schema@1.6.x`

互換性については[Valibotのリリースページ](https://github.com/fabian-hiller/valibot/releases)を確認してください。
:::

:::info[重要]
`request()`は`@zeltjs/core`からimportしてください。Valibotパッケージが提供するのはOpenAPI schemaアダプターのみです。
`valibot`のpeer dependencyは`^1.0.0`である必要があります。テストは`1.3.x`に対して行っています。それより古いバージョンを使うと型推論の問題が発生する場合があります。
:::

## Basic Usage {#basic-usage}

Valibot schemaを渡した`request()`を使い、リクエストボディをバリデーションします:

```typescript
import { Controller, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(150))),
});

@Controller('/users')
export class UserController {
  @Post('/')
  async create(req = request(CreateUserSchema), res = response()) {
    const body = await req.body();
    // bodyは { name: string; email: string; age?: number } として完全に型付けされる
    return res.json({ id: '1', ...body }, 201);
  }
}
```

## Form Data and File Uploads {#form-data-and-file-uploads}

ファイルアップロードを含む`multipart/form-data`リクエストをバリデーションするには`request(schema, { target: 'form' })`を使います:

```typescript
import { Controller, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

const UploadSchema = v.object({
  file: v.instance(File),
  description: v.optional(v.string()),
});

@Controller('/upload')
export class UploadController {
  @Post('/')
  async upload(req = request(UploadSchema, { target: 'form' }), res = response()) {
    const body = await req.body();
    // body.fileはFileオブジェクトである
    console.log(body.file.name, body.file.size, body.file.type);
    return res.json({ filename: body.file.name, size: body.file.size }, 201);
  }
}
```

### Target Options {#target-options}

`request()`の`target`オプションは、リクエストボディの形式を指定します:

| Target | Content-Type | Use Case |
|--------|-------------|----------|
| `'json'`(デフォルト) | `application/json` | JSON APIリクエスト |
| `'form'` | `multipart/form-data`、`application/x-www-form-urlencoded` | ファイルアップロード、HTMLフォーム |

### Multiple Files {#multiple-files}

```typescript
import { Controller, Post, request } from '@zeltjs/core';
import * as v from 'valibot';
// ---cut---
const MultiUploadSchema = v.object({
  files: v.array(v.instance(File)),
  category: v.string(),
});

@Controller('/upload')
class BulkUploadController {
  @Post('/bulk')
  async bulkUpload(req = request(MultiUploadSchema, { target: 'form' })) {
    const body = await req.body();
    for (const file of body.files) {
      console.log(file.name);
    }
    return { count: body.files.length };
  }
}
```

### OpenAPI Generation {#openapi-generation}

`'form'` targetを使う場合、OpenAPI出力は自動的にcontent typeとして`multipart/form-data`を使用します:

```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        $ref: '#/components/schemas/UploadSchema'
```

## Validation Error Response {#validation-error-response}

バリデーションが失敗すると、Zeltは自動的に400レスポンスを返します:

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

エラーレスポンスの詳細は[Error Handling](./error-handling.md)を参照してください。

## Common Validations {#common-validations}

### String Validations {#string-validations}

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  username: v.pipe(
    v.string(),
    v.minLength(3),
    v.maxLength(20),
    v.regex(/^[a-z0-9_]+$/i)
  ),
  email: v.pipe(v.string(), v.email()),
  url: v.pipe(v.string(), v.url()),
  uuid: v.pipe(v.string(), v.uuid()),
});
```

### Number Validations {#number-validations}

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  age: v.pipe(v.number(), v.minValue(0), v.maxValue(150)),
  price: v.pipe(v.number(), v.minValue(0)),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
```

### Array Validations {#array-validations}

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  tags: v.pipe(
    v.array(v.string()),
    v.minLength(1),
    v.maxLength(10)
  ),
  scores: v.array(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
});
```

### Optional and Nullable {#optional-and-nullable}

```typescript
import * as v from 'valibot';
// ---cut---
const schema = v.object({
  required: v.string(),
  optional: v.optional(v.string()),
  nullable: v.nullable(v.string()),
  optionalNullable: v.optional(v.nullable(v.string())),
  withDefault: v.optional(v.string(), 'default value'),
});
```

### Nested Objects {#nested-objects}

```typescript
import * as v from 'valibot';
// ---cut---
const AddressSchema = v.object({
  street: v.string(),
  city: v.string(),
  country: v.string(),
  zipCode: v.optional(v.string()),
});

const UserSchema = v.object({
  name: v.string(),
  address: AddressSchema,
  alternateAddresses: v.optional(v.array(AddressSchema)),
});
```

## Type Inference {#type-inference}

Valibot schemaは自動的なTypeScript型推論を提供します:

```typescript
import * as v from 'valibot';
// ---cut---
const UserSchema = v.object({
  name: v.string(),
  age: v.number(),
});

// schemaから型を推論する
type User = v.InferOutput<typeof UserSchema>;
// { name: string; age: number } と同等
```

## Why Valibot? {#why-valibot}

- **Type-safe** — 自動型推論を含むフルTypeScriptサポート
- **Lightweight** — tree-shakeable、使う分だけを含む
- **Fast** — 実行時性能に最適化
- **Composable** — シンプルな構成要素から複雑なschemaを組み立てられる
