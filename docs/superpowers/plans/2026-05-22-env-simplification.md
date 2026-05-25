# Env API Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate EnvConfig/EnvService into a single Env class, make EnvAdaptor internal, remove DotEnvConfig.

**Architecture:** Env (user-facing) → EnvAdaptor (internal abstraction) → ProcessEnvAdaptor (adapter-node). Old classes marked @deprecated.

**Tech Stack:** TypeScript, Vitest, @zeltjs/core, @zeltjs/adapter-node

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/src/modules/env/env.adaptor.ts` | Create | Internal abstraction for env value retrieval |
| `packages/core/src/modules/env/env.ts` | Create | User-facing Env class with getString/getNumber/getBoolean/getRequired |
| `packages/core/src/modules/env/env.test.ts` | Create | Tests for new Env class |
| `packages/core/src/modules/env/env.config.ts` | Modify | Add @deprecated |
| `packages/core/src/modules/env/env.service.ts` | Modify | Add @deprecated |
| `packages/core/src/modules/env/index.ts` | Modify | Export Env, EnvAdaptor |
| `packages/core/src/index.ts` | Modify | Export Env |
| `packages/adapter-node/src/process-env.adaptor.ts` | Create | ProcessEnvAdaptor implementation |
| `packages/adapter-node/src/on-node.ts` | Modify | Use ProcessEnvAdaptor instead of ProcessEnvConfig |
| `packages/adapter-node/src/process-env.config.ts` | Modify | Add @deprecated |
| `packages/adapter-node/src/dot-env.config.ts` | Modify | Add @deprecated |
| `packages/adapter-node/src/index.ts` | Modify | Export ProcessEnvAdaptor |
| `website/docs/configuration.md` | Modify | Update to use inject(Env) |

---

### Task 1: Create EnvAdaptor internal abstraction

**Files:**
- Create: `packages/core/src/modules/env/env.adaptor.ts`

- [ ] **Step 1: Create EnvAdaptor class**

```typescript
// packages/core/src/modules/env/env.adaptor.ts
import { Config } from '../../config';

@Config
export class EnvAdaptor {
  get(_key: string): string | undefined {
    return undefined;
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/modules/env/env.adaptor.ts
git commit -m "feat(core): add EnvAdaptor internal abstraction"
```

---

### Task 2: Create Env class with user-facing API

**Files:**
- Create: `packages/core/src/modules/env/env.ts`
- Create: `packages/core/src/modules/env/env.test.ts`

- [ ] **Step 1: Write failing tests for Env class**

```typescript
// packages/core/src/modules/env/env.test.ts
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Config } from '../../config';
import { createTestTargetBase } from '../../di/container';

import { Env } from './env';
import { EnvAdaptor } from './env-source';

@Config
class TestEnvSource extends EnvAdaptor {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}

let env: Env;

const setupEnv = async () => {
  const result = await createTestTargetBase(Env, {
    configs: [TestEnvSource],
  });
  env = result.target;
  return result;
};

describe('Env', () => {
  beforeAll(async () => {
    await setupEnv();
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getString', () => {
    it('returns env value when exists', () => {
      vi.stubEnv('TEST_KEY', 'test_value');
      expect(env.getString('TEST_KEY', 'default')).toBe('test_value');
    });

    it('returns default when env not exists', () => {
      expect(env.getString('NOT_EXISTS', 'default')).toBe('default');
    });

    it('returns empty string when no default and env not exists', () => {
      expect(env.getString('NOT_EXISTS')).toBe('');
    });
  });

  describe('getNumber', () => {
    it('returns parsed number when env exists', () => {
      vi.stubEnv('PORT', '3000');
      expect(env.getNumber('PORT', 8080)).toBe(3000);
    });

    it('returns default when env not exists', () => {
      expect(env.getNumber('NOT_EXISTS', 8080)).toBe(8080);
    });

    it('returns default when env is not a valid number', () => {
      vi.stubEnv('INVALID', 'not_a_number');
      expect(env.getNumber('INVALID', 8080)).toBe(8080);
    });

    it('returns 0 when no default and env not exists', () => {
      expect(env.getNumber('NOT_EXISTS')).toBe(0);
    });
  });

  describe('getBoolean', () => {
    it('returns true when env is "true"', () => {
      vi.stubEnv('ENABLED', 'true');
      expect(env.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns true when env is "1"', () => {
      vi.stubEnv('ENABLED', '1');
      expect(env.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns false when env is other value', () => {
      vi.stubEnv('ENABLED', 'false');
      expect(env.getBoolean('ENABLED', true)).toBe(false);
    });

    it('returns default when env not exists', () => {
      expect(env.getBoolean('NOT_EXISTS', true)).toBe(true);
    });

    it('returns false when no default and env not exists', () => {
      expect(env.getBoolean('NOT_EXISTS')).toBe(false);
    });
  });

  describe('getRequired', () => {
    it('returns env value when exists', () => {
      vi.stubEnv('API_KEY', 'secret123');
      expect(env.getRequired('API_KEY')).toBe('secret123');
    });

    it('throws when env not exists', () => {
      expect(() => env.getRequired('NOT_EXISTS')).toThrow(
        'Required environment variable NOT_EXISTS is not set',
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/src/modules/env/env.test.ts`
Expected: FAIL with "Cannot find module './env'"

- [ ] **Step 3: Implement Env class**

```typescript
// packages/core/src/modules/env/env.ts
import { inject } from '../../di/inject';
import { Injectable } from '../../di/injectable';

import { EnvAdaptor } from './env-source';

@Injectable()
export class Env {
  constructor(private source = inject(EnvAdaptor)) {}

  getString(key: string, defaultValue: string = ''): string {
    return this.source.get(key) ?? defaultValue;
  }

  getNumber(key: string, defaultValue: number = 0): number {
    const val = this.source.get(key);
    if (val === undefined) return defaultValue;
    const parsed = Number(val);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }

  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const val = this.source.get(key);
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }

  getRequired(key: string): string {
    const val = this.source.get(key);
    if (val === undefined) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return val;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/modules/env/env.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modules/env/env.ts packages/core/src/modules/env/env.test.ts
git commit -m "feat(core): add Env class with getString/getNumber/getBoolean/getRequired"
```

---

### Task 3: Export Env and EnvAdaptor from core

**Files:**
- Modify: `packages/core/src/modules/env/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update env module exports**

```typescript
// packages/core/src/modules/env/index.ts
export { Env } from './env';
export { EnvConfig } from './env.config';
export { EnvService } from './env.service';
export { EnvAdaptor } from './env-source';
```

- [ ] **Step 2: Update core package exports**

In `packages/core/src/index.ts`, find line 114:
```typescript
export { EnvConfig, EnvService } from './modules/env';
```

Replace with:
```typescript
export { Env, EnvConfig, EnvService, EnvAdaptor } from './modules/env';
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/modules/env/index.ts packages/core/src/index.ts
git commit -m "feat(core): export Env and EnvAdaptor"
```

---

### Task 4: Create ProcessEnvAdaptor in adapter-node

**Files:**
- Create: `packages/adapter-node/src/process-env.adaptor.ts`

- [ ] **Step 1: Create ProcessEnvAdaptor class**

```typescript
// packages/adapter-node/src/process-env.adaptor.ts
import { Config, EnvAdaptor } from '@zeltjs/core';

@Config
export class ProcessEnvAdaptor extends EnvAdaptor {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-node/src/process-env.adaptor.ts
git commit -m "feat(adapter-node): add ProcessEnvAdaptor"
```

---

### Task 5: Update onNode to use ProcessEnvAdaptor

**Files:**
- Modify: `packages/adapter-node/src/on-node.ts`

- [ ] **Step 1: Update imports in on-node.ts**

In `packages/adapter-node/src/on-node.ts`, find line 13:
```typescript
import { ProcessEnvConfig } from './process-env.config';
```

Replace with:
```typescript
import { ProcessEnvAdaptor } from './process-env-source';
```

- [ ] **Step 2: Update addFallbackConfig call**

In `packages/adapter-node/src/on-node.ts`, find line 208:
```typescript
  app.addFallbackConfig(ProcessEnvConfig);
```

Replace with:
```typescript
  app.addFallbackConfig(ProcessEnvAdaptor);
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run packages/adapter-node/src/on-node.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-node/src/on-node.ts
git commit -m "refactor(adapter-node): use ProcessEnvAdaptor in onNode"
```

---

### Task 6: Export ProcessEnvAdaptor from adapter-node

**Files:**
- Modify: `packages/adapter-node/src/index.ts`

- [ ] **Step 1: Add ProcessEnvAdaptor export**

In `packages/adapter-node/src/index.ts`, add after line 6:
```typescript
export { ProcessEnvAdaptor } from './process-env-source';
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapter-node/src/index.ts
git commit -m "feat(adapter-node): export ProcessEnvAdaptor"
```

---

### Task 7: Deprecate old classes

**Files:**
- Modify: `packages/core/src/modules/env/env.config.ts`
- Modify: `packages/core/src/modules/env/env.service.ts`
- Modify: `packages/adapter-node/src/process-env.config.ts`
- Modify: `packages/adapter-node/src/dot-env.config.ts`

- [ ] **Step 1: Deprecate EnvConfig**

```typescript
// packages/core/src/modules/env/env.config.ts
import { Config } from '../../config';

/**
 * @deprecated Use `inject(Env)` instead. Will be removed in next major version.
 * @see Env
 */
@Config
export class EnvConfig {
  get(_key: string): string | undefined {
    return undefined;
  }
}
```

- [ ] **Step 2: Deprecate EnvService**

```typescript
// packages/core/src/modules/env/env.service.ts
import { inject } from '../../di/inject';
import { Injectable } from '../../di/injectable';

import { EnvConfig } from './env.config';

/**
 * @deprecated Use `inject(Env)` instead. Will be removed in next major version.
 * @see Env
 */
@Injectable()
export class EnvService {
  constructor(private config = inject(EnvConfig)) {}

  getString<D extends string | null | undefined>(key: string, defaultValue: D): string | D {
    return this.config.get(key) ?? defaultValue;
  }

  getInteger<D extends number | null | undefined>(key: string, defaultValue: D): number | D {
    const val = this.config.get(key);
    if (val === undefined) return defaultValue;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }

  getBoolean<D extends boolean | null | undefined>(key: string, defaultValue: D): boolean | D {
    const val = this.config.get(key);
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }

  isDevelopment(): boolean {
    return this.getString('NODE_ENV', 'production') === 'development';
  }

  isProduction(): boolean {
    return this.getString('NODE_ENV', 'production') === 'production';
  }
}
```

- [ ] **Step 3: Deprecate ProcessEnvConfig**

```typescript
// packages/adapter-node/src/process-env.config.ts
import { Config, EnvConfig } from '@zeltjs/core';

/**
 * @deprecated Use `inject(Env)` instead. ProcessEnvAdaptor is registered automatically by onNode().
 * Will be removed in next major version.
 * @see Env
 */
@Config
export class ProcessEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
```

- [ ] **Step 4: Deprecate DotEnvConfig**

```typescript
// packages/adapter-node/src/dot-env.config.ts
import { Config, EnvConfig } from '@zeltjs/core';
import { config } from 'dotenv';

/**
 * @deprecated Use `import 'dotenv/config'` at your entry point instead.
 * Will be removed in next major version.
 *
 * @example
 * ```typescript
 * // main.ts
 * import 'dotenv/config';
 * import { createApp } from '@zeltjs/core';
 * ```
 */
@Config
export class DotEnvConfig extends EnvConfig {
  protected readonly paths: string[] = ['.env'];

  constructor() {
    super();
    for (const path of this.paths) {
      config({ path, override: true });
    }
  }
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/modules/env/env.config.ts packages/core/src/modules/env/env.service.ts packages/adapter-node/src/process-env.config.ts packages/adapter-node/src/dot-env.config.ts
git commit -m "deprecate: mark EnvConfig, EnvService, ProcessEnvConfig, DotEnvConfig as deprecated"
```

---

### Task 8: Run full test suite

**Files:** None (validation only)

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Run precommit**

Run: `pnpm precommit`
Expected: PASS

---

### Task 9: Update documentation

**Files:**
- Modify: `website/docs/configuration.md`

- [ ] **Step 1: Update configuration documentation**

In `website/docs/configuration.md`, update the examples to use `inject(Env)` instead of `inject(EnvConfig)`.

Find all occurrences of:
```typescript
constructor(private env = inject(EnvConfig)) {}
```

Replace with:
```typescript
constructor(private env = inject(Env)) {}
```

Also update method calls:
- `this.env.get('KEY')` → `this.env.getString('KEY')`
- `this.env.get('KEY') ?? 'default'` → `this.env.getString('KEY', 'default')`

Add a migration note at the top of the file after the frontmatter:

```markdown
:::info Migration Note
As of version X.X, use `inject(Env)` instead of `inject(EnvConfig)` or `inject(EnvService)`.
The old classes are deprecated and will be removed in the next major version.
:::
```

- [ ] **Step 2: Verify docs build**

Run: `cd website && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add website/docs/configuration.md
git commit -m "docs: update configuration to use inject(Env)"
```

---

## Summary

After completing all tasks:
1. Users can use `inject(Env)` with `getString`, `getNumber`, `getBoolean`, `getRequired`
2. Old classes (`EnvConfig`, `EnvService`, `ProcessEnvConfig`, `DotEnvConfig`) are deprecated
3. `.env` loading is user responsibility via `import 'dotenv/config'`
4. `EnvAdaptor` is internal, `ProcessEnvAdaptor` is registered by `onNode()` automatically
