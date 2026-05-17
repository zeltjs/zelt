# @zeltjs/kv

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Key-value store abstraction for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/kv @zeltjs/core
```

## Usage

```typescript
import { MemoryKVAdaptor } from '@zeltjs/kv';
import type { KVStore } from '@zeltjs/kv';

const kv: KVStore = new MemoryKVAdaptor();

await kv.set('user:1', { name: 'Alice' });
const user = await kv.get('user:1');

await kv.set('session:abc', { userId: '1' }, { ttl: 3600 });
```

## Adaptors

- `MemoryKVAdaptor` - In-memory store (for testing/development)
- `@zeltjs/redis` - Redis-backed store
