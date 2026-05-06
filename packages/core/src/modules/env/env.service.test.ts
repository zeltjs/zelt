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
});
