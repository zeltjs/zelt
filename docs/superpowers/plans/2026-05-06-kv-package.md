# @zeltjs/kv Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@zeltjs/kv` — interface package + reference `MemoryKV` driver + compliance test suite for downstream KV driver packages.

**Architecture:** Two-tier interface (`KVDriver`/`AtomicKVDriver` for top-level + `KVStore`/`AtomicKVStore` for namespaced view) with `namespace()` enforced as the only entry point to data ops. JSON serialization is internal. Memory driver ships in-package as the reference impl.

**Tech Stack:** TypeScript ESM, vitest, tsdown, pnpm workspace. Spec: `docs/superpowers/specs/2026-05-06-kv-design.md`.

---

### Task 1: Package skeleton

**Files:**
- Create: `packages/kv/package.json`
- Create: `packages/kv/tsconfig.json`
- Create: `packages/kv/tsdown.config.ts`
- Create: `packages/kv/src/index.ts`
- Modify: `tsconfig.json` (add reference)

- [ ] **Step 1: Create `packages/kv/package.json`**

```json
{
  "name": "@zeltjs/kv",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zeltjs/zelt.git",
    "directory": "packages/kv"
  },
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "import": "./dist/testing/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "peerDependencies": {
    "@zeltjs/core": "workspace:*"
  },
  "devDependencies": {
    "@zeltjs/core": "workspace:*",
    "@types/node": "22.19.17"
  }
}
```

- [ ] **Step 2: Create `packages/kv/tsconfig.json`**

```json
{
  "extends": "@9wick/eslint-plugin-strict-type-rules/tsconfig/strictest.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "experimentalDecorators": true,
    "erasableSyntaxOnly": false,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/kv/tsdown.config.ts`**

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/testing/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['@zeltjs/core', /^@zeltjs\/core\//],
  },
});
```

- [ ] **Step 4: Create empty `packages/kv/src/index.ts`**

```typescript
export {};
```

- [ ] **Step 5: Add reference to root `tsconfig.json`**

Find the existing `references` array and append `{ "path": "packages/kv" }`. The references array currently lists core/contract/testing/adapter-node/cli — add kv at the end.

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: success, no errors.

- [ ] **Step 7: Verify package builds and typechecks**

Run: `pnpm --filter @zeltjs/kv typecheck`
Expected: no errors (empty package compiles).

Run: `pnpm --filter @zeltjs/kv build`
Expected: `dist/index.js` and `dist/index.d.ts` are produced.

- [ ] **Step 8: Commit**

```bash
git add packages/kv tsconfig.json pnpm-lock.yaml
git commit -m "feat(kv): add package skeleton"
```

---

### Task 2: Errors

**Files:**
- Create: `packages/kv/src/errors.ts`
- Create: `packages/kv/src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kv/src/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { KVError, MinPrefixLengthError, MinTtlError, UnsupportedOperationError } from './errors';

describe('errors', () => {
  it('KVError extends Error and carries a name', () => {
    const err = new KVError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('KVError');
    expect(err.message).toBe('boom');
  });

  it('UnsupportedOperationError extends KVError', () => {
    const err = new UnsupportedOperationError('not supported');
    expect(err).toBeInstanceOf(KVError);
    expect(err.name).toBe('UnsupportedOperationError');
  });

  it('MinTtlError extends KVError', () => {
    const err = new MinTtlError('ttl too small');
    expect(err).toBeInstanceOf(KVError);
    expect(err.name).toBe('MinTtlError');
  });

  it('MinPrefixLengthError extends KVError', () => {
    const err = new MinPrefixLengthError();
    expect(err).toBeInstanceOf(KVError);
    expect(err.name).toBe('MinPrefixLengthError');
    expect(err.message).toBe('namespace prefix must not be empty');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @zeltjs/kv test errors`
Expected: FAIL with "Cannot find module './errors'".

- [ ] **Step 3: Create `packages/kv/src/errors.ts`**

```typescript
export class KVError extends Error {
  override name = 'KVError';
}

export class UnsupportedOperationError extends KVError {
  override name = 'UnsupportedOperationError';
}

export class MinTtlError extends KVError {
  override name = 'MinTtlError';
}

export class MinPrefixLengthError extends KVError {
  override name = 'MinPrefixLengthError';

  constructor() {
    super('namespace prefix must not be empty');
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @zeltjs/kv test errors`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/errors.ts packages/kv/src/errors.test.ts
git commit -m "feat(kv): add error classes"
```

---

### Task 3: Types (interfaces)

**Files:**
- Create: `packages/kv/src/types.ts`

Type-only file. No runtime code, no test (TypeScript compilation is the test).

- [ ] **Step 1: Create `packages/kv/src/types.ts`**

```typescript
/** Top-level driver. namespace で view を取り出すまで data ops は不可。 */
export interface KVDriver {
  namespace(prefix: string): KVStore;
}

/** atomic 操作対応の driver。namespace の戻り値が AtomicKVStore */
export interface AtomicKVDriver extends KVDriver {
  namespace(prefix: string): AtomicKVStore;
}

/** namespaced view。実際の data ops はここ */
export interface KVStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, opts?: SetOptions): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /** TTL 延長 (session touch / lock extend 用)。key 不在時は false。 */
  expire(key: string, ttlSec: number): Promise<boolean>;
  /** 子 namespace。チェーン可能。 */
  namespace(prefix: string): KVStore;
}

/** atomic 操作対応 view */
export interface AtomicKVStore extends KVStore {
  /** atomic incr。最初の incr 時のみ TTL をセット。 */
  incr(key: string, by?: number, opts?: { ttlSec?: number }): Promise<number>;
  /** atomic set if not exists。set されたら true、既存なら false。 */
  setnx<T>(key: string, value: T, opts?: SetOptions): Promise<boolean>;
  /** 値一致時のみ削除。lock release で他人の lock を消さない保証。 */
  delIf(key: string, expected: unknown): Promise<boolean>;
  namespace(prefix: string): AtomicKVStore;
}

export type SetOptions = {
  ttlSec?: number;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeltjs/kv typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kv/src/types.ts
git commit -m "feat(kv): add KVStore / AtomicKVStore interfaces"
```

---

### Task 4: JSON serialize helper

**Files:**
- Create: `packages/kv/src/serialize.ts`
- Create: `packages/kv/src/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kv/src/serialize.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { KVError } from './errors';
import { deserialize, serialize } from './serialize';

describe('serialize', () => {
  it('round-trips primitives', () => {
    expect(deserialize(serialize(42))).toBe(42);
    expect(deserialize(serialize('hello'))).toBe('hello');
    expect(deserialize(serialize(true))).toBe(true);
    expect(deserialize(serialize(null))).toBe(null);
  });

  it('round-trips objects', () => {
    const value = { a: 1, b: ['x', 'y'], c: { d: true } };
    expect(deserialize(serialize(value))).toEqual(value);
  });

  it('throws KVError when serializing undefined', () => {
    expect(() => serialize(undefined)).toThrow(KVError);
  });

  it('returns undefined when deserializing null input', () => {
    expect(deserialize(null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/kv test serialize`
Expected: FAIL with module not found.

- [ ] **Step 3: Create `packages/kv/src/serialize.ts`**

```typescript
import { KVError } from './errors';

export const serialize = (value: unknown): string => {
  if (value === undefined) {
    throw new KVError('cannot serialize undefined');
  }
  return JSON.stringify(value);
};

export const deserialize = <T>(raw: string | null): T | undefined => {
  if (raw === null) return undefined;
  return JSON.parse(raw) as T;
};
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/kv test serialize`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/serialize.ts packages/kv/src/serialize.test.ts
git commit -m "feat(kv): add JSON serialize helpers"
```

---

### Task 5: Namespace helper

**Files:**
- Create: `packages/kv/src/namespace.ts`
- Create: `packages/kv/src/namespace.test.ts`

`withNamespace` is a small utility for driver implementers — wraps a store-like object so all key arguments are prefixed. We test it against an in-memory mock to lock the contract.

- [ ] **Step 1: Write the failing test**

Create `packages/kv/src/namespace.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { MinPrefixLengthError } from './errors';
import { assertNonEmptyPrefix, joinPrefix } from './namespace';

describe('namespace helpers', () => {
  it('joinPrefix concatenates prefixes', () => {
    expect(joinPrefix('a:', 'b:')).toBe('a:b:');
    expect(joinPrefix('cache:', 'user:')).toBe('cache:user:');
  });

  it('assertNonEmptyPrefix throws on empty string', () => {
    expect(() => assertNonEmptyPrefix('')).toThrow(MinPrefixLengthError);
  });

  it('assertNonEmptyPrefix passes for non-empty', () => {
    expect(() => assertNonEmptyPrefix('x')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/kv test namespace`
Expected: FAIL.

- [ ] **Step 3: Create `packages/kv/src/namespace.ts`**

```typescript
import { MinPrefixLengthError } from './errors';

export const assertNonEmptyPrefix = (prefix: string): void => {
  if (prefix.length === 0) throw new MinPrefixLengthError();
};

export const joinPrefix = (a: string, b: string): string => a + b;
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/kv test namespace`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/namespace.ts packages/kv/src/namespace.test.ts
git commit -m "feat(kv): add namespace prefix helpers"
```

---

### Task 6: MemoryKV — non-atomic ops

**Files:**
- Create: `packages/kv/src/memory-kv.ts`
- Create: `packages/kv/src/memory-kv.test.ts`

Build the `MemoryKV` driver step by step, starting with `KVStore` ops (get/set/del/has/expire/namespace). Atomic ops in next task.

- [ ] **Step 1: Write the failing test for `get`/`set` round-trip**

Create `packages/kv/src/memory-kv.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryKV } from './memory-kv';

describe('MemoryKV (KVStore ops)', () => {
  let kv: MemoryKV;

  beforeEach(() => {
    kv = new MemoryKV();
  });

  it('namespace returns a store and rejects empty prefix', () => {
    expect(() => kv.namespace('')).toThrow();
    const store = kv.namespace('test:');
    expect(store).toBeDefined();
  });

  it('set + get round-trips a JSON object', async () => {
    const store = kv.namespace('test:');
    await store.set('foo', { a: 1, b: ['x'] });
    expect(await store.get('foo')).toEqual({ a: 1, b: ['x'] });
  });

  it('get returns undefined for missing key', async () => {
    const store = kv.namespace('test:');
    expect(await store.get('missing')).toBeUndefined();
  });

  it('has reflects existence', async () => {
    const store = kv.namespace('test:');
    expect(await store.has('foo')).toBe(false);
    await store.set('foo', 1);
    expect(await store.has('foo')).toBe(true);
    await store.del('foo');
    expect(await store.has('foo')).toBe(false);
  });

  it('namespace isolates keys', async () => {
    const a = kv.namespace('a:');
    const b = kv.namespace('b:');
    await a.set('shared', 1);
    expect(await b.get('shared')).toBeUndefined();
  });

  it('chained namespace concatenates prefixes', async () => {
    const cache = kv.namespace('cache:');
    const user = cache.namespace('user:');
    await user.set('42', { name: 'Alice' });
    // top-level confirmation: same physical key
    expect(await kv.namespace('cache:user:').get('42')).toEqual({ name: 'Alice' });
  });
});

describe('MemoryKV (TTL)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TTL expires the key', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('foo', 1, { ttlSec: 10 });
    expect(await store.get('foo')).toBe(1);
    vi.advanceTimersByTime(11_000);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('expire(key, ttl) extends TTL on existing key, returns true', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('foo', 1);
    expect(await store.expire('foo', 5)).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('expire(key, ttl) returns false for missing key', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    expect(await store.expire('missing', 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/kv test memory-kv`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `packages/kv/src/memory-kv.ts` (KVStore ops first)**

```typescript
import { Injectable } from '@zeltjs/core';

import { assertNonEmptyPrefix, joinPrefix } from './namespace';
import { deserialize, serialize } from './serialize';
import type {
  AtomicKVDriver,
  AtomicKVStore,
  KVStore,
  SetOptions,
} from './types';

type Entry = {
  raw: string;
  /** epoch ms。undefined は永続 */
  expiresAt?: number;
};

@Injectable()
export class MemoryKV implements AtomicKVDriver {
  private readonly data = new Map<string, Entry>();

  namespace(prefix: string): AtomicKVStore {
    assertNonEmptyPrefix(prefix);
    return new MemoryKVStore(this.data, prefix);
  }
}

class MemoryKVStore implements AtomicKVStore {
  constructor(
    private readonly data: Map<string, Entry>,
    private readonly prefix: string,
  ) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  private current(key: string): Entry | undefined {
    const entry = this.data.get(this.k(key));
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.data.delete(this.k(key));
      return undefined;
    }
    return entry;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.current(key);
    return entry ? deserialize<T>(entry.raw) : undefined;
  }

  async set<T>(key: string, value: T, opts?: SetOptions): Promise<void> {
    const raw = serialize(value);
    const expiresAt = opts?.ttlSec !== undefined ? Date.now() + opts.ttlSec * 1000 : undefined;
    this.data.set(this.k(key), { raw, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.data.delete(this.k(key));
  }

  async has(key: string): Promise<boolean> {
    return this.current(key) !== undefined;
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    const entry = this.current(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlSec * 1000;
    return true;
  }

  namespace(sub: string): AtomicKVStore {
    assertNonEmptyPrefix(sub);
    return new MemoryKVStore(this.data, joinPrefix(this.prefix, sub));
  }

  // atomic ops — to be implemented in Task 7
  async incr(_key: string, _by?: number, _opts?: { ttlSec?: number }): Promise<number> {
    throw new Error('not implemented');
  }
  async setnx<T>(_key: string, _value: T, _opts?: SetOptions): Promise<boolean> {
    throw new Error('not implemented');
  }
  async delIf(_key: string, _expected: unknown): Promise<boolean> {
    throw new Error('not implemented');
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/kv test memory-kv`
Expected: PASS (KVStore tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/memory-kv.ts packages/kv/src/memory-kv.test.ts
git commit -m "feat(kv): add MemoryKV with KVStore ops"
```

---

### Task 7: MemoryKV — atomic ops

**Files:**
- Modify: `packages/kv/src/memory-kv.ts`
- Modify: `packages/kv/src/memory-kv.test.ts`

- [ ] **Step 1: Append failing tests for atomic ops to `memory-kv.test.ts`**

```typescript
describe('MemoryKV (AtomicKVStore ops)', () => {
  it('incr from missing key starts at 1, then increments', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    expect(await store.incr('counter')).toBe(1);
    expect(await store.incr('counter')).toBe(2);
    expect(await store.incr('counter', 5)).toBe(7);
  });

  it('incr sets TTL only on first call when ttlSec given', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKV();
      const store = kv.namespace('test:');
      await store.incr('c', 1, { ttlSec: 10 });
      vi.advanceTimersByTime(5_000);
      // 2 度目の incr で TTL が延長されない
      await store.incr('c', 1, { ttlSec: 100 });
      vi.advanceTimersByTime(6_000);
      // 元の 10 秒 TTL を過ぎているので消える
      expect(await store.get('c')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setnx returns true on first call, false on existing', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    expect(await store.setnx('lock', 'token-1')).toBe(true);
    expect(await store.setnx('lock', 'token-2')).toBe(false);
    expect(await store.get('lock')).toBe('token-1');
  });

  it('setnx with ttlSec sets expiry', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKV();
      const store = kv.namespace('test:');
      await store.setnx('lock', 'token', { ttlSec: 5 });
      vi.advanceTimersByTime(6_000);
      expect(await store.get('lock')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('delIf deletes when value matches', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('lock', 'token-A');
    expect(await store.delIf('lock', 'token-A')).toBe(true);
    expect(await store.has('lock')).toBe(false);
  });

  it('delIf does not delete when value mismatches', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('lock', 'token-A');
    expect(await store.delIf('lock', 'token-B')).toBe(false);
    expect(await store.get('lock')).toBe('token-A');
  });
});
```

- [ ] **Step 2: Run, verify atomic tests fail**

Run: `pnpm --filter @zeltjs/kv test memory-kv`
Expected: 6 atomic tests FAIL with "not implemented".

- [ ] **Step 3: Replace atomic ops in `memory-kv.ts`**

Replace the three placeholder methods (`incr`, `setnx`, `delIf`) in `MemoryKVStore` with real implementations:

```typescript
  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    const k = this.k(key);
    const entry = this.current(key);
    if (!entry) {
      const expiresAt = opts?.ttlSec !== undefined ? Date.now() + opts.ttlSec * 1000 : undefined;
      this.data.set(k, { raw: serialize(by), expiresAt });
      return by;
    }
    const next = (deserialize<number>(entry.raw) ?? 0) + by;
    entry.raw = serialize(next);
    return next;
  }

  async setnx<T>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    if (this.current(key)) return false;
    const expiresAt = opts?.ttlSec !== undefined ? Date.now() + opts.ttlSec * 1000 : undefined;
    this.data.set(this.k(key), { raw: serialize(value), expiresAt });
    return true;
  }

  async delIf(key: string, expected: unknown): Promise<boolean> {
    const entry = this.current(key);
    if (!entry) return false;
    if (entry.raw !== serialize(expected)) return false;
    this.data.delete(this.k(key));
    return true;
  }
```

- [ ] **Step 4: Run, verify all tests pass**

Run: `pnpm --filter @zeltjs/kv test memory-kv`
Expected: PASS (all KVStore + AtomicKVStore tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/memory-kv.ts packages/kv/src/memory-kv.test.ts
git commit -m "feat(kv): add MemoryKV atomic ops (incr/setnx/delIf)"
```

---

### Task 8: Compliance test suite

**Files:**
- Create: `packages/kv/src/testing/index.ts`
- Create: `packages/kv/src/testing/compliance.ts`
- Create: `packages/kv/src/testing/compliance.test.ts`

The compliance suite is itself testable: applied to `MemoryKV`, all assertions must pass. We use the `MemoryKV` self-test as both validation of the suite and validation of the driver.

- [ ] **Step 1: Create `packages/kv/src/testing/compliance.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AtomicKVDriver, AtomicKVStore, KVDriver, KVStore } from '../types';

export const runKVStoreComplianceTests = (factory: () => KVDriver): void => {
  describe('KVStore compliance', () => {
    let store: KVStore;

    beforeEach(() => {
      store = factory().namespace('compliance:');
    });

    it('get returns undefined for missing key', async () => {
      expect(await store.get('missing')).toBeUndefined();
    });

    it('set + get round-trips a JSON object', async () => {
      await store.set('foo', { a: 1, nested: ['x', 'y'] });
      expect(await store.get('foo')).toEqual({ a: 1, nested: ['x', 'y'] });
    });

    it('del removes the key', async () => {
      await store.set('foo', 1);
      await store.del('foo');
      expect(await store.has('foo')).toBe(false);
    });

    it('has reflects existence', async () => {
      expect(await store.has('foo')).toBe(false);
      await store.set('foo', 1);
      expect(await store.has('foo')).toBe(true);
    });

    it('chained namespace concatenates prefixes', async () => {
      const sub = store.namespace('sub:');
      await sub.set('foo', 1);
      // when we read via parent prefix + sub key, we should see the value
      const directParent = factory().namespace('compliance:sub:');
      expect(await directParent.get('foo')).toBe(1);
    });

    it('empty namespace prefix throws', () => {
      expect(() => store.namespace('')).toThrow();
    });
  });

  describe('KVStore TTL compliance', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('TTL expires the key', async () => {
      const store = factory().namespace('compliance-ttl:');
      await store.set('foo', 1, { ttlSec: 10 });
      vi.advanceTimersByTime(11_000);
      expect(await store.get('foo')).toBeUndefined();
    });

    it('expire returns false on missing key', async () => {
      const store = factory().namespace('compliance-ttl:');
      expect(await store.expire('missing', 5)).toBe(false);
    });
  });
};

export const runAtomicKVStoreComplianceTests = (factory: () => AtomicKVDriver): void => {
  runKVStoreComplianceTests(factory);

  describe('AtomicKVStore compliance', () => {
    let store: AtomicKVStore;

    beforeEach(() => {
      store = factory().namespace('atomic:');
    });

    it('incr starts at 1 from missing, then increments', async () => {
      expect(await store.incr('counter')).toBe(1);
      expect(await store.incr('counter')).toBe(2);
      expect(await store.incr('counter', 5)).toBe(7);
    });

    it('setnx returns true on new, false on existing', async () => {
      expect(await store.setnx('lock', 'a')).toBe(true);
      expect(await store.setnx('lock', 'b')).toBe(false);
      expect(await store.get('lock')).toBe('a');
    });

    it('delIf deletes only on value match', async () => {
      await store.set('lock', 'A');
      expect(await store.delIf('lock', 'B')).toBe(false);
      expect(await store.get('lock')).toBe('A');
      expect(await store.delIf('lock', 'A')).toBe(true);
      expect(await store.has('lock')).toBe(false);
    });

    it('incr is atomic under concurrent calls', async () => {
      await Promise.all(Array.from({ length: 50 }, () => store.incr('hot')));
      expect(await store.get('hot')).toBe(50);
    });
  });
};
```

- [ ] **Step 2: Create `packages/kv/src/testing/index.ts`**

```typescript
export { runAtomicKVStoreComplianceTests, runKVStoreComplianceTests } from './compliance';
```

- [ ] **Step 3: Self-test — apply compliance suite to `MemoryKV`**

Create `packages/kv/src/testing/compliance.test.ts`:

```typescript
import { MemoryKV } from '../memory-kv';
import { runAtomicKVStoreComplianceTests } from './compliance';

runAtomicKVStoreComplianceTests(() => new MemoryKV());
```

- [ ] **Step 4: Run, verify all compliance tests pass against MemoryKV**

Run: `pnpm --filter @zeltjs/kv test testing/compliance`
Expected: PASS (all KVStore + Atomic tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/testing
git commit -m "feat(kv): add compliance test suite and MemoryKV self-test"
```

---

### Task 9: Public exports

**Files:**
- Modify: `packages/kv/src/index.ts`

- [ ] **Step 1: Replace `packages/kv/src/index.ts` with full exports**

```typescript
export { MemoryKV } from './memory-kv';

export {
  KVError,
  MinPrefixLengthError,
  MinTtlError,
  UnsupportedOperationError,
} from './errors';

export type {
  AtomicKVDriver,
  AtomicKVStore,
  KVDriver,
  KVStore,
  SetOptions,
} from './types';

export { assertNonEmptyPrefix, joinPrefix } from './namespace';
```

- [ ] **Step 2: Verify build produces both entry points**

Run: `pnpm --filter @zeltjs/kv build`
Expected: `dist/index.js`, `dist/index.d.ts`, `dist/testing/index.js`, `dist/testing/index.d.ts` all exist.

- [ ] **Step 3: Verify all package tests pass**

Run: `pnpm --filter @zeltjs/kv test`
Expected: PASS, all suites green.

- [ ] **Step 4: Verify root typecheck still passes**

Run: `pnpm typecheck`
Expected: PASS (root project + all packages).

- [ ] **Step 5: Commit**

```bash
git add packages/kv/src/index.ts
git commit -m "feat(kv): finalize public exports"
```

---

## Verification Checklist (run before declaring done)

- [ ] `pnpm --filter @zeltjs/kv test` — all suites pass
- [ ] `pnpm --filter @zeltjs/kv build` — produces `dist/index.{js,d.ts}` and `dist/testing/index.{js,d.ts}`
- [ ] `pnpm --filter @zeltjs/kv typecheck` — clean
- [ ] `pnpm typecheck` — root project clean
- [ ] `pnpm lint` — clean (biome / eslint / oxlint as configured)
- [ ] No commits combine unrelated changes; each task = its own commit
- [ ] `MemoryKV` passes the compliance suite (proves the suite works for downstream drivers)
