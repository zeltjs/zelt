---
---

# Unit Testing

Zeltは、dependency injectionに対応したサービスの単体テストのためのユーティリティを含む `@zeltjs/testing` パッケージを提供します。

## インストール {#installation}

```bash
pnpm add -D @zeltjs/testing
```

## テストランナー用Adapter {#test-runner-adapters}

使用するテストランナー用のadapterからimportします。これにより `afterAll` を通じたクリーンアップが自動登録されます。

### Vitest {#vitest}

```typescript
// @noErrors
// 理由: テストフレームワークのセットアップ例としてimportのみを示す
import { onTest, createTestTarget } from '@zeltjs/testing/vitest';
```

### Jest {#jest}

```typescript
// @noErrors
// 理由: テストフレームワークのセットアップ例としてimportのみを示す
import { onTest, createTestTarget } from '@zeltjs/testing/jest';
```

### Bun {#bun}

```typescript
// @noErrors
// 理由: テストフレームワークのセットアップ例としてimportのみを示す
import { onTest, createTestTarget } from '@zeltjs/testing/bun';
```

### Node.js Test Runner {#nodejs-test-runner}

```typescript
// @noErrors
// 理由: テストフレームワークのセットアップ例としてimportのみを示す
import { onTest, createTestTarget } from '@zeltjs/testing/node';
```

### Manual Setup {#manual-setup}

手動で制御したい場合や別のテストランナーを使う場合は、base packageからimportして自分で `shutdownAll()` を呼び出します。

```typescript
// @noErrors
// 理由: テストフレームワークのセットアップ例としてimportのみを示す
import { onTest, createTestTarget, shutdownAll } from '@zeltjs/testing';
import { afterAll } from 'your-test-runner';

afterAll(shutdownAll);
```

## createTestTarget {#createtesttarget}

`createTestTarget` は、dependency injectionを使ってサービスをインスタンス化する主要なテストユーティリティです。lifecycle管理とクリーンアップを自動的に処理します。

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { Injectable } from '@zeltjs/core';

@Injectable()
class UserService {
  async create(data: { name: string }) { return data; }
}
// ---cut---
describe('UserService', () => {
  it('should create user', async () => {
    const { target } = await createTestTarget(UserService);

    const user = await target.create({ name: 'Alice' });
    expect(user.name).toBe('Alice');
  });
});
```

### Options {#options}

| オプション | 型 | 説明 |
|--------|------|-------------|
| `configs` | `Class[]` | 登録するConfiguration class |
| `overrides` | `Override[]` | 依存関係のモック実装 |

### 戻り値 {#return-value}

| プロパティ | 型 | 説明 |
|----------|------|-------------|
| `target` | `T` | インスタンス化されたサービス |
| `get` | `(cls) => T` | コンテナから追加の依存関係を解決する |
| `shutdown` | `() => Promise<void>` | クリーンアップ関数(`shutdownAll` に自動登録される) |

## Mocking Dependencies {#mocking-dependencies}

`overrides` を使って実装をモックに置き換えます(Solitary Unit Test)。

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { Injectable, inject } from '@zeltjs/core';

@Injectable()
class EmailService {
  async send(to: string, subject: string) { return { to, subject }; }
}

@Injectable()
class UserService {
  constructor(private emailService = inject(EmailService)) {}
  async register(data: { email: string }) {
    await this.emailService.send(data.email, 'Welcome!');
  }
}
// ---cut---
describe('UserService', () => {
  it('should send welcome email', async () => {
    const mockEmailService = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const { target } = await createTestTarget(UserService, {
      overrides: [
        { provide: EmailService, useValue: mockEmailService },
      ],
    });

    await target.register({ email: 'alice@example.com' });
    expect(mockEmailService.send).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining('Welcome')
    );
  });
});
```

## Lifecycle Management {#lifecycle-management}

`createTestTarget` は、shutdown関数を自動的に `shutdownAll` へ登録します。

1. **Startup**: テストターゲットが作成される際、登録済みの `Lifecycle` 実装がすべて起動します
2. **Shutdown**: テストランナーのglobal teardownで `shutdownAll()` を呼び出します(adapterのimportによって自動的に処理されます)

これにより、テストが失敗した場合でもリソースが適切にクリーンアップされます。

## Testing Commands {#testing-commands}

CLIコマンドをテストする際は、テストごとに新しいapp instanceを作成する必要があります。`createRuntime()` を呼び出した後、app instanceは再利用できません。

### The Problem {#the-problem}

グローバルなapp instanceを再利用すると、エラーが発生します。

```typescript
import { describe, it, expect } from 'vitest';
import { createApp, Command, cliSchema, ZeltLifecycleStateError, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() { console.log('Hello!'); }
}

const app = createApp([command([GreetCommand])]);
// ---cut---
describe('GreetCommand', () => {
  it('test 1', async () => {
    const nodeApp = await onNode(app);
    await nodeApp.commands.execCommand(['greet']);
    // 動作する
  });

  it('test 2 — reusing the same app instance throws', async () => {
    // ❌ 既にreadyなappに対してonNode()を呼び出すことはできない
    await expect(onNode(app)).rejects.toThrow(ZeltLifecycleStateError);
  });
});
```

`onNode()` が呼び出されると、appは `ready` stateへ遷移します。同じinstanceに対して `onNode()` を再度呼び出すと、lifecycle hookを再登録できないため失敗します。

### The Solution {#the-solution}

テストごとに新しいapp instanceを作成します。

```typescript
import { describe, it, afterEach } from 'vitest';
import { createApp, Command, cliSchema, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() { console.log('Hello!'); }
}
// ---cut---
describe('GreetCommand', () => {
  let nodeApp:
    | {
        shutdown(): Promise<void>;
        commands: { execCommand(argv: readonly string[]): Promise<{ exitCode: number }> };
      }
    | undefined;

  afterEach(async () => {
    await nodeApp?.shutdown();
  });

  it('test 1', async () => {
    const app = createApp([command([GreetCommand])]);
    nodeApp = await onNode(app);
    await nodeApp.commands.execCommand(['greet']);
    // 動作する
  });

  it('test 2', async () => {
    const app = createApp([command([GreetCommand])]);
    nodeApp = await onNode(app);
    await nodeApp.commands.execCommand(['greet']);
    // 動作する — 新しいapp instance
  });
});
```

### Using a Factory Function {#using-a-factory-function}

テストをすっきりさせるため、app作成をfactoryへ切り出します。

```typescript
import { describe, it, afterEach } from 'vitest';
import { createApp, Command, cliSchema, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() { console.log('Hello!'); }
}
// ---cut---
function createTestApp() {
  return createApp([command([GreetCommand])]);
}

describe('GreetCommand', () => {
  let nodeApp:
    | {
        shutdown(): Promise<void>;
        commands: { execCommand(argv: readonly string[]): Promise<{ exitCode: number }> };
      }
    | undefined;

  afterEach(async () => {
    await nodeApp?.shutdown();
  });

  it('executes successfully', async () => {
    nodeApp = await onNode(createTestApp());
    const result = await nodeApp.commands.execCommand(['greet']);
    // resultをassertする
  });
});
```
