import { runAtomicKVStoreComplianceTests } from '@zeltjs/kv/testing';
import { afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';

import { RedisConfig } from './redis.config';
import { RedisKV } from './redis-kv';

const config = new RedisConfig();

let driver: RedisKV;

beforeEach(async () => {
  driver = new RedisKV(config);
  const client = (driver as unknown as { client: Redis }).client;
  const keys = await client.keys('compliance*');
  if (keys.length > 0) await client.del(...keys);
  const atomicKeys = await client.keys('atomic*');
  if (atomicKeys.length > 0) await client.del(...atomicKeys);
  const nsKeysA = await client.keys('a:*');
  if (nsKeysA.length > 0) await client.del(...nsKeysA);
  const nsKeysB = await client.keys('b:*');
  if (nsKeysB.length > 0) await client.del(...nsKeysB);
});

afterAll(async () => {
  await driver?.shutdown();
});

runAtomicKVStoreComplianceTests(() => driver, { realClock: true, sleepMs: 1500 });
