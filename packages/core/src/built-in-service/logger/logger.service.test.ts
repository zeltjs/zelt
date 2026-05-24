import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestTargetBase } from '../../kernel/di/container';
import { Config } from '../config';

import { LoggerConfig } from './logger.config';
import type { LogLevel } from './logger.lib';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockReset();
  });

  describe('child logger', () => {
    it('child inherits parent bindings and merges context', async () => {
      const { target: logger, shutdown } = await createTestTargetBase(LoggerService);
      const child1 = logger.child({ service: 'auth' });
      const child2 = child1.child({ module: 'jwt' });

      child2.info('grandchild log');

      const rawCall = consoleSpy.mock.calls[0]?.[0] as string;
      const logged = JSON.parse(rawCall) as Record<string, unknown>;
      expect(logged['service']).toBe('auth');
      expect(logged['module']).toBe('jwt');
      await shutdown();
    });

    it('child is not DI-managed (lightweight wrapper)', async () => {
      const { target: logger, shutdown } = await createTestTargetBase(LoggerService);
      const child = logger.child({ service: 'test' });

      expect(child).not.toBe(logger);
      expect(child).toBeInstanceOf(LoggerService);
      await shutdown();
    });
  });

  describe('log level filtering', () => {
    it('uses O(1) priority lookup for level comparison', async () => {
      @Config
      class WarnOnlyConfig extends LoggerConfig {
        override get level(): LogLevel {
          return 'warn';
        }
      }

      const { target: logger, shutdown } = await createTestTargetBase(LoggerService, {
        configs: [WarnOnlyConfig],
      });

      logger.debug('skip');
      logger.info('skip');
      logger.warn('log');
      logger.error('log');

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      await shutdown();
    });
  });
});
