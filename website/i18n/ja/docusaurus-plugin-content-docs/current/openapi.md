---
sidebar_position: 10
---

# OpenAPI

Zelt はコントローラーから OpenAPI 3.1 仕様を自動生成します。デコレーターやアノテーションは不要です。

## 概要

`@zeltjs/openapi` パッケージは、ビルド時にコントローラーメソッドのシグネチャを解析し、標準の OpenAPI 3.1 仕様を生成します。

## インストール

```bash
pnpm add @zeltjs/openapi
```

## 設定

プロジェクトルートに `zelt.config.ts` を作成します:

```typescript
import { defineConfig } from '@zeltjs/openapi';

export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',
});
```

### 設定オプション

| オプション | 型 | 説明 |
|--------|------|-------------|
| `controllers` | `string[]` | コントローラーファイルを検索する glob パターン |
| `dist` | `string` | 生成ファイルの出力ディレクトリ |
| `tsconfig` | `string` | tsconfig.json へのパス（OpenAPI 生成に必須） |

`@Controller` デコレーターを持つクラスは、glob パターンにマッチするファイルをスキャンして自動検出されます。

## OpenAPI 仕様の生成

### 一度だけビルド

```bash
pnpm zelt-openapi build
```

`<dist>/openapi.json` が生成されます。

### ウォッチモード

```bash
pnpm zelt-openapi watch
```

コントローラーの変更時に継続的に再生成します。

### npm スクリプト

`package.json` に追加:

```json
{
  "scripts": {
    "generate": "zelt-openapi build",
    "generate:watch": "zelt-openapi watch"
  }
}
```

## 生成される openapi.json

標準の OpenAPI 3.1 仕様:

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

## 仕組み

Zelt は [Scramble](https://scramble.dedoc.co/) にインスパイアされた「ゼロアノテーション」アプローチを採用しています:

1. **静的解析** — ビルド時にコントローラーメソッドのシグネチャを解析
2. **型抽出** — TypeScript の型からリクエスト/レスポンス型を抽出
3. **スキーマ生成** — TypeScript 型を OpenAPI 用 JSON Schema に変換

これにより、ランタイムコードはクリーンなまま保たれます。バリデーションのために書いた定義以外に、デコレーターやスキーマ定義は不要です。
