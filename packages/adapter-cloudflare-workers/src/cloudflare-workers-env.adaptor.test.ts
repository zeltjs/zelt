import { beforeEach, describe, expect, it } from 'vitest';
import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';
import { env } from './test-fixtures/cloudflare-workers';

describe('CloudflareWorkersEnvAdaptor', () => {
  const mockEnv = env;

  beforeEach(() => {
    for (const key of Object.keys(mockEnv)) {
      delete mockEnv[key];
    }
  });

  it('returns string value from cloudflare env', () => {
    mockEnv['API_KEY'] = 'secret123';

    const config = new CloudflareWorkersEnvAdaptor();

    expect(config.get('API_KEY')).toBe('secret123');
  });

  it('returns undefined for missing key', () => {
    const config = new CloudflareWorkersEnvAdaptor();

    expect(config.get('NON_EXISTENT')).toBeUndefined();
  });

  it('returns undefined for non-string values', () => {
    mockEnv['NUMBER_VAL'] = 123;
    mockEnv['OBJECT_VAL'] = { foo: 'bar' };

    const config = new CloudflareWorkersEnvAdaptor();

    expect(config.get('NUMBER_VAL')).toBeUndefined();
    expect(config.get('OBJECT_VAL')).toBeUndefined();
  });
});
