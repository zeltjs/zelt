---
sidebar_position: 7
---

# テスト

:::info 準備中
テストのドキュメントは作成中です。
:::

Koyaはアプリケーションをテストするためのユーティリティを含む`@koya/testing`パッケージを提供しています。

## インストール

```bash
pnpm add -D @koya/testing vitest
```

## 基本的な例

```typescript
import { describe, it, expect } from 'vitest';
import { app } from './app';

describe('Hello API', () => {
  it('should return greeting', async () => {
    const res = await app.request('/hello/world');
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Hello, world!' });
  });
});
```

## 型安全なクライアントでのテスト

生成された`AppType`とHonoのクライアントを使用して、完全に型付けされたテストを行います。`AppType`の生成方法は[OpenAPIと型生成](./openapi.md)を参照してください。

```typescript
import { hc } from 'hono/client';
import { describe, it, expect } from 'vitest';
import { app } from './app';
import type { AppType } from './generated/app.gen';

describe('Hello API', () => {
  const client = hc<AppType>('http://localhost', {
    fetch: (input, init) => app.fetch(new Request(input, init)),
  });

  it('should return greeting with type safety', async () => {
    const res = await client.hello[':name'].$get({ 
      param: { name: 'world' } 
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    // bodyは完全に型付け: { message: string }
    expect(body.message).toBe('Hello, world!');
  });
});
```

モック、統合テスト、ベストプラクティスを含む包括的なテストドキュメントをお待ちください。
