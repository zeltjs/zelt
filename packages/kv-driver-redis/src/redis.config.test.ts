import { Container } from '@needle-di/core';
import { afterEach, describe, expect, it } from 'vitest';

import { RedisConfig } from './redis.config';

describe('RedisConfig', () => {
  const original = process.env.REDIS_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  });

  it('defaults url to redis://localhost:6379 when REDIS_URL unset', () => {
    delete process.env.REDIS_URL;
    const config = new Container().get(RedisConfig);
    expect(config.url).toBe('redis://localhost:6379');
  });

  it('reads url from REDIS_URL when set', () => {
    process.env.REDIS_URL = 'redis://example.com:6380';
    const config = new Container().get(RedisConfig);
    expect(config.url).toBe('redis://example.com:6380');
  });

  it('default options is empty', () => {
    const config = new Container().get(RedisConfig);
    expect(config.options).toEqual({});
  });

  it('Token is the class itself', () => {
    expect(RedisConfig.Token).toBe(RedisConfig);
  });
});
