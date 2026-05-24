import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../app/create-app';
import { createApp } from '../../app/create-app';
import { Config } from '../config';

import { Env } from './env';
import { EnvSource } from './env-source';

@Config
class TestEnvSource extends EnvSource {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}

let env: Env;
let app: App;

const setupEnv = async () => {
  app = createApp({ configs: [TestEnvSource] });
  const { get } = await app.ready();
  env = get(Env);
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
