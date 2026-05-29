import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';

describe('CloudflareWorkersEnvAdaptor', () => {
  const mockEnv = env as Record<string, string | undefined>;

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
    (mockEnv as Record<string, unknown>)['NUMBER_VAL'] = 123;
    (mockEnv as Record<string, unknown>)['OBJECT_VAL'] = { foo: 'bar' };

    const config = new CloudflareWorkersEnvAdaptor();

    expect(config.get('NUMBER_VAL')).toBeUndefined();
    expect(config.get('OBJECT_VAL')).toBeUndefined();
  });
});
