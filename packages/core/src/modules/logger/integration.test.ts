import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpApp, Controller, Get, inject, Config } from '../../index';
import { Logger, LoggerConfig } from './index';

describe('Logger integration', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
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

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('[INFO] hello');
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

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('[ERROR] should log');
  });
});
