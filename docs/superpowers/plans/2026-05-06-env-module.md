# Env Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@zeltjs/core/modules/env`として環境変数の読み込みと型安全なアクセスを提供するモジュールを実装する

**Architecture:** dotenvで.envファイルをパースし、EnvServiceのgetterメソッドで型安全にアクセス。loggerモジュールと同じDIパターン（@Config + @Injectable）を使用。

**Tech Stack:** TypeScript, dotenv, vitest, needle-di

---

## File Structure

```
packages/core/src/modules/env/
├── env.config.ts      # EnvConfig - 読み込むファイルパスの設定
├── env.loader.ts      # loadEnvFiles - dotenvラッパー
├── env.service.ts     # EnvService - 型安全なgetter
├── env.service.test.ts
└── index.ts           # 公開API
```

---

### Task 1: dotenv依存の追加

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: dotenvのバージョン確認**

Run: `npm view dotenv version`

- [ ] **Step 2: package.jsonにdotenv追加**

`packages/core/package.json`の`dependencies`に追加:

```json
{
  "dependencies": {
    "dotenv": "16.5.0",
    "hono": "4.12.16",
    "valibot": "1.3.1"
  }
}
```

- [ ] **Step 3: pnpm install実行**

Run: `pnpm install`
Expected: dotenvがインストールされる

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "deps(core): add dotenv for env module"
```

---

### Task 2: env.loader.ts の実装

**Files:**
- Create: `packages/core/src/modules/env/env.loader.ts`

- [ ] **Step 1: env.loaderを作成**

```typescript
import { config } from 'dotenv';

export const loadEnvFiles = (paths: string[]): void => {
  for (const path of paths) {
    config({ path, override: true });
  }
};
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/modules/env/env.loader.ts
git commit -m "feat(core): add env loader for dotenv files"
```

---

### Task 3: env.config.ts の実装

**Files:**
- Create: `packages/core/src/modules/env/env.config.ts`

- [ ] **Step 1: env.configを作成**

```typescript
import { Config } from '../../config';

@Config
export class EnvConfig {
  static readonly Token = EnvConfig;

  get envFilePath(): string[] {
    return ['.env'];
  }
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/modules/env/env.config.ts
git commit -m "feat(core): add EnvConfig for env file paths"
```

---

### Task 4: env.service.ts のgetString実装とテスト

**Files:**
- Create: `packages/core/src/modules/env/env.service.ts`
- Create: `packages/core/src/modules/env/env.service.test.ts`

- [ ] **Step 1: getStringの失敗するテストを書く**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('EnvService', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getString', () => {
    it('returns env value when exists', async () => {
      vi.stubEnv('TEST_KEY', 'test_value');
      
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getString('TEST_KEY', 'default')).toBe('test_value');
    });

    it('returns default string when env not exists', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getString('NOT_EXISTS', 'default')).toBe('default');
    });

    it('returns null when default is null', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getString('NOT_EXISTS', null)).toBeNull();
    });

    it('returns undefined when default is undefined', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getString('NOT_EXISTS', undefined)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @zeltjs/core test -- env.service.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: getStringを実装**

```typescript
import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';

import { EnvConfig } from './env.config';
import { loadEnvFiles } from './env.loader';

@Injectable()
export class EnvService {
  private loaded = false;

  constructor(private config = injectConfig(EnvConfig)) {}

  private ensureLoaded(): void {
    if (!this.loaded) {
      loadEnvFiles(this.config.envFilePath);
      this.loaded = true;
    }
  }

  getString<D extends string | null | undefined>(key: string, defaultValue: D): string | D {
    this.ensureLoaded();
    return process.env[key] ?? defaultValue;
  }
}
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- env.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modules/env/env.service.ts packages/core/src/modules/env/env.service.test.ts
git commit -m "feat(core): add EnvService.getString"
```

---

### Task 5: getInteger の実装とテスト

**Files:**
- Modify: `packages/core/src/modules/env/env.service.ts`
- Modify: `packages/core/src/modules/env/env.service.test.ts`

- [ ] **Step 1: getIntegerの失敗するテストを追加**

`env.service.test.ts`に追加:

```typescript
  describe('getInteger', () => {
    it('returns parsed integer when env exists', async () => {
      vi.stubEnv('PORT', '3000');
      
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getInteger('PORT', 8080)).toBe(3000);
    });

    it('returns default when env not exists', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getInteger('NOT_EXISTS', 8080)).toBe(8080);
    });

    it('returns default when env is not a valid integer', async () => {
      vi.stubEnv('INVALID', 'not_a_number');
      
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getInteger('INVALID', 8080)).toBe(8080);
    });

    it('returns null when default is null', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getInteger('NOT_EXISTS', null)).toBeNull();
    });
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @zeltjs/core test -- env.service.test.ts`
Expected: FAIL (getInteger is not a function)

- [ ] **Step 3: getIntegerを実装**

`env.service.ts`のEnvServiceクラスに追加:

```typescript
  getInteger<D extends number | null | undefined>(key: string, defaultValue: D): number | D {
    this.ensureLoaded();
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- env.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modules/env/env.service.ts packages/core/src/modules/env/env.service.test.ts
git commit -m "feat(core): add EnvService.getInteger"
```

---

### Task 6: getBoolean の実装とテスト

**Files:**
- Modify: `packages/core/src/modules/env/env.service.ts`
- Modify: `packages/core/src/modules/env/env.service.test.ts`

- [ ] **Step 1: getBooleanの失敗するテストを追加**

`env.service.test.ts`に追加:

```typescript
  describe('getBoolean', () => {
    it('returns true when env is "true"', async () => {
      vi.stubEnv('ENABLED', 'true');
      
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns true when env is "1"', async () => {
      vi.stubEnv('ENABLED', '1');
      
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns false when env is other value', async () => {
      vi.stubEnv('ENABLED', 'false');
      
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getBoolean('ENABLED', true)).toBe(false);
    });

    it('returns default when env not exists', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getBoolean('NOT_EXISTS', true)).toBe(true);
    });

    it('returns null when default is null', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);
      
      expect(service.getBoolean('NOT_EXISTS', null)).toBeNull();
    });
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @zeltjs/core test -- env.service.test.ts`
Expected: FAIL (getBoolean is not a function)

- [ ] **Step 3: getBooleanを実装**

`env.service.ts`のEnvServiceクラスに追加:

```typescript
  getBoolean<D extends boolean | null | undefined>(key: string, defaultValue: D): boolean | D {
    this.ensureLoaded();
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- env.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modules/env/env.service.ts packages/core/src/modules/env/env.service.test.ts
git commit -m "feat(core): add EnvService.getBoolean"
```

---

### Task 7: index.ts と package.json exports の追加

**Files:**
- Create: `packages/core/src/modules/env/index.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: index.tsを作成**

```typescript
export { EnvConfig } from './env.config';
export { EnvService } from './env.service';
```

- [ ] **Step 2: package.jsonにexports追加**

`packages/core/package.json`の`exports`に追加:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./workers": {
      "types": "./dist/workers.d.ts",
      "import": "./dist/workers.js"
    },
    "./lambda": {
      "types": "./dist/lambda.d.ts",
      "import": "./dist/lambda.js"
    },
    "./modules/logger": {
      "types": "./dist/modules/logger/index.d.ts",
      "import": "./dist/modules/logger/index.js"
    },
    "./modules/env": {
      "types": "./dist/modules/env/index.d.ts",
      "import": "./dist/modules/env/index.js"
    }
  }
}
```

- [ ] **Step 3: ビルド確認**

Run: `pnpm --filter @zeltjs/core build`
Expected: PASS

- [ ] **Step 4: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 5: 全テスト実行**

Run: `pnpm --filter @zeltjs/core test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/modules/env/index.ts packages/core/package.json
git commit -m "feat(core): export env module as @zeltjs/core/modules/env"
```

---

### Task 8: loggerモジュールのファイル名リネーム

**Files:**
- Rename: `packages/core/src/modules/logger/config.ts` → `packages/core/src/modules/logger/logger.config.ts`
- Rename: `packages/core/src/modules/logger/logger.ts` → `packages/core/src/modules/logger/logger.service.ts`
- Modify: `packages/core/src/modules/logger/index.ts`
- Rename: `packages/core/src/modules/logger/logger.test.ts` → `packages/core/src/modules/logger/logger.service.test.ts`
- Rename: `packages/core/src/modules/logger/integration.test.ts` → `packages/core/src/modules/logger/logger.integration.test.ts`

- [ ] **Step 1: ファイルをリネーム**

```bash
cd packages/core/src/modules/logger
git mv config.ts logger.config.ts
git mv logger.ts logger.service.ts
git mv logger.test.ts logger.service.test.ts
git mv integration.test.ts logger.integration.test.ts
```

- [ ] **Step 2: logger.config.tsのimportを更新**

`logger.config.ts`は変更不要（内部importなし）

- [ ] **Step 3: logger.service.tsのimportを更新**

```typescript
import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';

import { LoggerConfig } from './logger.config';
```

- [ ] **Step 4: index.tsを更新**

```typescript
export { Logger } from './logger.service';
export { LoggerConfig } from './logger.config';
```

- [ ] **Step 5: logger.service.test.tsのimportを更新**

ファイル内の`./logger`を`./logger.service`に、`./config`を`./logger.config`に変更

- [ ] **Step 6: logger.integration.test.tsのimportを更新**

ファイル内の`./logger`を`./logger.service`に、`./config`を`./logger.config`に変更

- [ ] **Step 7: 全テスト実行**

Run: `pnpm --filter @zeltjs/core test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A packages/core/src/modules/logger/
git commit -m "refactor(core): rename logger module files for unique naming"
```
