/// <reference types="node" />
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestTargetBase } from '../../kernel/di/container';
import { Config } from '../config';

import { EnvConfig } from './env.config';
import { EnvService } from './env.service';

@Config
class TestProcessEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}

let service: EnvService;

const setupEnvService = async () => {
  const result = await createTestTargetBase(EnvService, {
    configs: [TestProcessEnvConfig],
  });
  service = result.target;
  return result;
};

describe('EnvService', () => {
  beforeAll(async () => {
    await setupEnvService();
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getString', () => {
    it('returns env value when exists', () => {
      vi.stubEnv('TEST_KEY', 'test_value');
      expect(service.getString('TEST_KEY', 'default')).toBe('test_value');
    });

    it('returns default string when env not exists', () => {
      expect(service.getString('NOT_EXISTS', 'default')).toBe('default');
    });

    it('returns null when default is null', () => {
      expect(service.getString('NOT_EXISTS', null)).toBeNull();
    });

    it('returns undefined when default is undefined', () => {
      expect(service.getString('NOT_EXISTS', undefined)).toBeUndefined();
    });
  });

  describe('getInteger', () => {
    it('returns parsed integer when env exists', () => {
      vi.stubEnv('PORT', '3000');
      expect(service.getInteger('PORT', 8080)).toBe(3000);
    });

    it('returns default when env not exists', () => {
      expect(service.getInteger('NOT_EXISTS', 8080)).toBe(8080);
    });

    it('returns default when env is not a valid integer', () => {
      vi.stubEnv('INVALID', 'not_a_number');
      expect(service.getInteger('INVALID', 8080)).toBe(8080);
    });

    it('returns null when default is null', () => {
      expect(service.getInteger('NOT_EXISTS', null)).toBeNull();
    });
  });

  describe('getBoolean', () => {
    it('returns true when env is "true"', () => {
      vi.stubEnv('ENABLED', 'true');
      expect(service.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns true when env is "1"', () => {
      vi.stubEnv('ENABLED', '1');
      expect(service.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns false when env is other value', () => {
      vi.stubEnv('ENABLED', 'false');
      expect(service.getBoolean('ENABLED', true)).toBe(false);
    });

    it('returns default when env not exists', () => {
      expect(service.getBoolean('NOT_EXISTS', true)).toBe(true);
    });

    it('returns null when default is null', () => {
      expect(service.getBoolean('NOT_EXISTS', null)).toBeNull();
    });
  });
});
