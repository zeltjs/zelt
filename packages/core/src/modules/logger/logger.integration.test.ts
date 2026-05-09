import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createHttpApp, Controller, Get, inject, Config } from '../../index';

import { Logger, LoggerConfig } from './index';

describe('Logger integration', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockReset();
  });

  it('uses default LoggerConfig when no config provided', async () => {
    @Controller('/test')
    class TestController {
      constructor(private logger = inject(Logger)) {}

      @Get('/')
      handle() {
        this.logger.info('hello');
        return { ok: true };
      }
    }

    const app = createHttpApp({
      controllers: [TestController],
    });
    await app.ready();

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const rawCall = consoleSpy.mock.calls[0]?.[0] as string;
    const logged = JSON.parse(rawCall) as Record<string, unknown>;
    expect(logged['level']).toBe('info');
    expect(logged['message']).toBe('hello');
  });

  it('uses custom config when provided', async () => {
    @Config
    class CustomLoggerConfig extends LoggerConfig {
      override get level(): 'debug' | 'info' | 'warn' | 'error' {
        return 'error';
      }
    }

    @Controller('/test')
    class TestController {
      constructor(private logger = inject(Logger)) {}

      @Get('/')
      handle() {
        this.logger.info('should not log');
        this.logger.error('should log');
        return { ok: true };
      }
    }

    const app = createHttpApp({
      controllers: [TestController],
      configs: [CustomLoggerConfig],
    });
    await app.ready();

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const rawCall = consoleSpy.mock.calls[0]?.[0] as string;
    const logged = JSON.parse(rawCall) as Record<string, unknown>;
    expect(logged['level']).toBe('error');
    expect(logged['message']).toBe('should log');
  });
});
