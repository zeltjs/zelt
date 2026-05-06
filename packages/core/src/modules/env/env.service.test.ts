import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('EnvService', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getString', () => {
    it('returns env value when exists', async () => {
      vi.stubEnv('TEST_KEY', 'test_value');

      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getString('TEST_KEY', 'default')).toBe('test_value');
    });

    it('returns default string when env not exists', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getString('NOT_EXISTS', 'default')).toBe('default');
    });

    it('returns null when default is null', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getString('NOT_EXISTS', null)).toBeNull();
    });

    it('returns undefined when default is undefined', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getString('NOT_EXISTS', undefined)).toBeUndefined();
    });
  });

  describe('getInteger', () => {
    it('returns parsed integer when env exists', async () => {
      vi.stubEnv('PORT', '3000');

      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getInteger('PORT', 8080)).toBe(3000);
    });

    it('returns default when env not exists', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getInteger('NOT_EXISTS', 8080)).toBe(8080);
    });

    it('returns default when env is not a valid integer', async () => {
      vi.stubEnv('INVALID', 'not_a_number');

      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getInteger('INVALID', 8080)).toBe(8080);
    });

    it('returns null when default is null', async () => {
      const { EnvService } = await import('./env.service');
      const { Container } = await import('@needle-di/core');
      const container = new Container();
      const service = container.get(EnvService);

      expect(service.getInteger('NOT_EXISTS', null)).toBeNull();
    });
  });
});
