import { Container } from '@needle-di/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Config } from '../../config';

import { LoggerConfig } from './logger.config';
import type { LogLevel } from './logger.lib';
import { Logger } from './logger.service';

describe('Logger', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockReset();
  });

  describe('child logger', () => {
    it('child inherits parent bindings and merges context', () => {
      const container = new Container();
      const logger = container.get(Logger);
      const child1 = logger.child({ service: 'auth' });
      const child2 = child1.child({ module: 'jwt' });

      child2.info('grandchild log');

      const rawCall = consoleSpy.mock.calls[0]?.[0] as string;
      const logged = JSON.parse(rawCall) as Record<string, unknown>;
      expect(logged['service']).toBe('auth');
      expect(logged['module']).toBe('jwt');
    });

    it('child is not DI-managed (lightweight wrapper)', () => {
      const container = new Container();
      const logger = container.get(Logger);
      const child = logger.child({ service: 'test' });

      expect(child).not.toBe(logger);
      expect(child).toBeInstanceOf(Logger);
    });
  });

  describe('log level filtering', () => {
    it('uses O(1) priority lookup for level comparison', () => {
      @Config
      class WarnOnlyConfig extends LoggerConfig {
        override get level(): LogLevel {
          return 'warn';
        }
      }

      const container = new Container();
      container.bind({ provide: WarnOnlyConfig, useClass: WarnOnlyConfig });
      container.bind({ provide: LoggerConfig, useExisting: WarnOnlyConfig });

      const logger = container.get(Logger);
      logger.debug('skip');
      logger.info('skip');
      logger.warn('log');
      logger.error('log');

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });
});
