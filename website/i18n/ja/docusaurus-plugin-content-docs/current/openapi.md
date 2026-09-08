---
---

# OpenAPI

Zeltはcontrollerから自動的にOpenAPI 3.1仕様を生成します — デコレータやアノテーションは不要です。

## 概要 {#overview}

`@zeltjs/openapi` パッケージは、build時にcontrollerのメソッドシグネチャを解析し、標準的なOpenAPI 3.1仕様を生成します。

## インストール {#installation}

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="pkg-manager">
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @zeltjs/openapi
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @zeltjs/openapi
    ```
  </TabItem>
  <TabItem value="bun" label="bun">
    ```bash
    bun add @zeltjs/openapi
    ```
  </TabItem>
</Tabs>

### Valibot adapterと併用する場合 {#with-the-valibot-adapter}

Valibotからschemaを生成する場合は、`@zeltjs/validator-valibot/openapi` を使い、`@valibot/to-json-schema` をインストールしてください:

<Tabs groupId="pkg-manager">
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @zeltjs/openapi @valibot/to-json-schema
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @zeltjs/openapi @valibot/to-json-schema
    ```
  </TabItem>
  <TabItem value="bun" label="bun">
    ```bash
    bun add @zeltjs/openapi @valibot/to-json-schema
    ```
  </TabItem>
</Tabs>

:::tip バージョン互換性
`@valibot/to-json-schema` は `valibot` のバージョンと合わせる必要があります。詳細は [Validation - Installation](./validation.md#installation) を参照してください。
:::

## 設定 {#configuration}

プロジェクトルートに `zelt.config.ts` ファイルを作成します:

```typescript
type OpenApiConfig = {
  controllers: string[];
  dist: string;
  tsconfig: string;
};
declare function defineConfig(config: OpenApiConfig): OpenApiConfig;
// ---cut---
export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',
});
```

### 設定オプション {#configuration-options}

| オプション | 型 | 説明 |
|--------|------|-------------|
| `controllers` | `string[]` | controllerファイルを見つけるためのglobパターン |
| `dist` | `string` | 生成されたファイルの出力ディレクトリ |
| `tsconfig` | `string` | tsconfig.jsonへのパス(OpenAPI生成に必須) |

Controllerは、globパターンに一致するファイルをスキャンし、`@Controller` デコレータを持つクラスを検出することで自動的に発見されます。

## OpenAPI仕様の生成 {#generating-openapi-spec}

### 単発ビルド {#one-time-build}

```bash
pnpm zelt-openapi build
```

これにより `<dist>/openapi.json` が生成されます。

### Watchモード {#watch-mode}

```bash
pnpm zelt-openapi watch
```

controllerが変更されるたびに継続的に再生成します。

### npmスクリプト {#npm-scripts}

`package.json` に追加します:

```json
{
  "scripts": {
    "generate": "zelt-openapi build",
    "generate:watch": "zelt-openapi watch"
  }
}
```

## 生成されるopenapi.json {#generated-openapijson}

標準的なOpenAPI 3.1仕様:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "zelt app",
    "version": "0.0.0"
  },
  "paths": {
    "/hello/{name}": {
      "get": {
        "parameters": [...],
        "responses": {...}
      }
    }
  },
  "components": {
    "schemas": {...}
  }
}
```

## 仕組み {#how-it-works}

Zeltは [Scramble](https://scramble.dedoc.co/) に着想を得た「ゼロアノテーション」アプローチを使用します:

1. **静的解析** — build時にcontrollerのメソッドシグネチャを解析する
2. **型抽出** — TypeScriptの型からrequest/responseの型を抽出する
3. **Schema生成** — TypeScriptの型をOpenAPI用のJSON Schemaに変換する

これにより、あなたのランタイムコードはクリーンなまま保たれます — validationのためにすでに書いているもの以外の、デコレータやschema定義は不要です。
