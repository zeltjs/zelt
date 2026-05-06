import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestContainer } from '../../internal/container';

import { ProcessEnvConfig } from './env.config';
import { EnvService } from './env.service';

const createEnvService = () => {
  const { target } = createTestContainer(EnvService, {
    configs: [ProcessEnvConfig],
  });
  return target;
};

describe('EnvService', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getString', () => {
    it('returns env value when exists', () => {
      vi.stubEnv('TEST_KEY', 'test_value');
      const service = createEnvService();
      expect(service.getString('TEST_KEY', 'default')).toBe('test_value');
    });

    it('returns default string when env not exists', () => {
      const service = createEnvService();
      expect(service.getString('NOT_EXISTS', 'default')).toBe('default');
    });

    it('returns null when default is null', () => {
      const service = createEnvService();
      expect(service.getString('NOT_EXISTS', null)).toBeNull();
    });

    it('returns undefined when default is undefined', () => {
      const service = createEnvService();
      expect(service.getString('NOT_EXISTS', undefined)).toBeUndefined();
    });
  });

  describe('getInteger', () => {
    it('returns parsed integer when env exists', () => {
      vi.stubEnv('PORT', '3000');
      const service = createEnvService();
      expect(service.getInteger('PORT', 8080)).toBe(3000);
    });

    it('returns default when env not exists', () => {
      const service = createEnvService();
      expect(service.getInteger('NOT_EXISTS', 8080)).toBe(8080);
    });

    it('returns default when env is not a valid integer', () => {
      vi.stubEnv('INVALID', 'not_a_number');
      const service = createEnvService();
      expect(service.getInteger('INVALID', 8080)).toBe(8080);
    });

    it('returns null when default is null', () => {
      const service = createEnvService();
      expect(service.getInteger('NOT_EXISTS', null)).toBeNull();
    });
  });

  describe('getBoolean', () => {
    it('returns true when env is "true"', () => {
      vi.stubEnv('ENABLED', 'true');
      const service = createEnvService();
      expect(service.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns true when env is "1"', () => {
      vi.stubEnv('ENABLED', '1');
      const service = createEnvService();
      expect(service.getBoolean('ENABLED', false)).toBe(true);
    });

    it('returns false when env is other value', () => {
      vi.stubEnv('ENABLED', 'false');
      const service = createEnvService();
      expect(service.getBoolean('ENABLED', true)).toBe(false);
    });

    it('returns default when env not exists', () => {
      const service = createEnvService();
      expect(service.getBoolean('NOT_EXISTS', true)).toBe(true);
    });

    it('returns null when default is null', () => {
      const service = createEnvService();
      expect(service.getBoolean('NOT_EXISTS', null)).toBeNull();
    });
  });
});
