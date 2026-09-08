---
---

# Hono Client

Zeltは、Honoの `hc` client向けに型安全なclient型(`AppType`)を生成します — IDEの自動補完付きで、完全に型安全なAPI呼び出しを実現します。

## 概要 {#overview}

`@zeltjs/hono-client` パッケージは、controllerのシグネチャから `AppType` を生成します。この型はHonoの `hc` clientと統合し、以下を提供します:

- リクエストパラメータとレスポンスボディの完全なTypeScript推論
- APIエンドポイントのIDE自動補完
- API呼び出しのコンパイル時型チェック

## インストール {#installation}

```bash
pnpm add @zeltjs/hono-client
```

## 設定(CLI Plugin) {#configuration-cli-plugin}

`zelt.config.ts` に `honoClientPlugin` を追加します:

```typescript
declare function defineConfig(config: {
  entry: string;
  plugins?: any[];
}): any;
declare function honoClientPlugin(options?: {
  entry?: string;
  outDir?: string;
  output?: string;
}): any;
// ---cut---
export default defineConfig({
  entry: './dist/app.js',
  plugins: [
    honoClientPlugin({
      outDir: './generated',
      output: 'app-type.ts',
    }),
  ],
});
```

### Pluginオプション {#plugin-options}

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `entry` | `string` | config.entry | ビルド済みアプリモジュールへのパス |
| `outDir` | `string` | `'./generated'` | 出力ディレクトリ |
| `output` | `string` | `'app-type.ts'` | 出力ファイル名 |

## AppTypeの生成 {#generating-apptype}

型ファイルを生成するには `zelt build` を実行します:

```bash
pnpm zelt build
```

これにより、`AppType` を含む `<outDir>/<output>`(デフォルト: `generated/app-type.ts`)が生成されます。

## プログラムからの生成 {#programmatic-generation}

ビルドがZelt CLIによって駆動されない場合 — electron-viteパイプライン、カスタムビルドスクリプト、monorepoのタスクランナーなど — `GeneratorService.generateFromApp()` を直接使います。これはアプリの `http` featureを受け取り、生成された型ソースを文字列として返します:

```typescript
import { createApp, http } from '@zeltjs/core';
import { GeneratorService } from '@zeltjs/hono-client';
declare function writeFileSync(path: string, data: string, encoding: 'utf-8'): void;
const app = createApp([http({ controllers: [] })]);
// ---cut---
const generator = new GeneratorService();
const content = await generator.generateFromApp(app.http, { distDir: './dist' });

writeFileSync('./dist/app-type.generated.ts', content, 'utf-8');
```

これは、アプリのモジュールがコンパイルされた後のビルドステップとして実行してください — 例えば、ビルドされた出力に対して `node` から実行するスクリプトや、electron-viteの `buildStart` フックなどです。

### 生成オプション {#generate-options}

| オプション | 型 | 説明 |
|--------|------|-------------|
| `distDir` | `string` | ビルド済みアプリ出力のディレクトリ。生成されたimportはこれを基準に解決される |
| `portable` | `boolean` | `distDir` へのimportの代わりに、リテラル型を解決済みの自己完結型ファイルを出力する |
| `tsconfig` | `string` | プロジェクトのtsconfigへのパス(`portable: true` の場合必須) |
| `projectRoot` | `string` | パス解決用のプロジェクトルート(`portable: true` の場合必須) |

生成されたファイルがserverパッケージの外で消費される場合 — 例えばElectronのrendererや、serverの `dist` からimportできない別のフロントエンドworkspaceなど — `portable: true` を使ってください。

### 生成されるapp-type.ts {#generated-app-typets}

```typescript
import type { Route, BuildAppType } from '@zeltjs/hono-client';
// ---cut---
// このファイルは @zeltjs/hono-client によって生成されます。編集しないでください。

export type AppType = BuildAppType<[
  Route<'GET', '/hello/:name', () => { message: string }>,
  Route<'POST', '/hello', (input: { name: string }) => { id: string }>,
]>;
```

## AppTypeの利用 {#using-apptype}

### 型安全なAPI Client {#type-safe-api-client}

```typescript
type AppType = {
  hello: {
    ':name': {
      $get(args: { param: { name: string } }): Promise<Response & { json(): Promise<{ message: string }> }>;
    };
  };
};
declare function hc<T>(baseUrl: string): T;
// ---cut---
const client = hc<AppType>('https://api.example.com');

// 完全に型付けされている - IDEの自動補完と型チェック
const response = await client.hello[':name'].$get({
  param: { name: 'world' },
});

if (response.ok) {
  const data = await response.json();
  // dataは { message: string } として型付けされる
  console.log(data.message);
}
```

### 型安全なClientでのテスト {#testing-with-type-safe-client}

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => Promise<void>): void;
declare function expect(value: any): { toBe(expected: any): void };
type AppType = {
  hello: {
    ':name': {
      $get(args: { param: { name: string } }): Promise<Response & { json(): Promise<{ message: string }> }>;
    };
  };
};
declare function hc<T>(baseUrl: string, options?: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }): T;

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
const readyApp = await app.createRuntime();
// ---cut---
describe('Hello API', () => {
  const client = hc<AppType>('http://localhost', {
    fetch: (input, init) => readyApp.http.fetch(new Request(input, init)),
  });

  it('should return greeting', async () => {
    const res = await client.hello[':name'].$get({
      param: { name: 'world' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Hello, world!');
  });
});
```

## 仕組み {#how-it-works}

1. **メタデータ抽出** — build時にZeltアプリからroute metadataを読み取る
2. **型生成** — 抽出されたroute情報から `AppType` を生成する
3. **Client統合** — 生成された型がHonoの `hc` clientと統合する

生成された `AppType` はcontrollerのrouteをHonoのroute型にマッピングし、`hc` clientがパラメータとレスポンスの型を自動的に推論できるようにします。
