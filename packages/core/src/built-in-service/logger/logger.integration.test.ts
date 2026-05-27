import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Next } from '../../index';
import { Config, Controller, createApp, Get, inject, Middleware } from '../../index';

import { JsonlFormatter, PrettyFormatter } from './formatter';
import type { TransportBinding } from './index';
import { Logger, LoggerConfig, withLogContext } from './index';
import { ConsoleTransport } from './transport';

describe('Logger integration', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  // needle-di's injectable() stores subtypes on the parent class via a symbol.
  // Tests that apply @Config to LoggerConfig subclasses mutate this registry globally.
  // Saving and restoring it between tests prevents cross-test DI resolution failures.
  const loggerConfigSymbols = Object.getOwnPropertySymbols(LoggerConfig);
  const injectableSymbol = loggerConfigSymbols[0] as symbol;
  let savedInjectableTargets: unknown;

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
    savedInjectableTargets = (LoggerConfig as unknown as Record<symbol, unknown>)[injectableSymbol];
  });

  afterEach(() => {
    consoleSpy.mockReset();
    (LoggerConfig as unknown as Record<symbol, unknown>)[injectableSymbol] = savedInjectableTargets;
  });

  describe('default behavior', () => {
    it('outputs structured JSON by default', async () => {
      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('hello', { action: 'test' });
          return { ok: true };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
      });
      await app.ready();

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(200);

      const raw = consoleSpy.mock.calls[0]?.[0] as string;
      const logged = JSON.parse(raw) as Record<string, unknown>;
      expect(logged['level']).toBe('info');
      expect(logged['message']).toBe('hello');
      expect(logged['action']).toBe('test');
      expect(logged['timestamp']).toBeDefined();
    });
  });

  describe('withLogContext middleware integration', () => {
    it('propagates request context to all logs', async () => {
      @Middleware
      class RequestContextMiddleware {
        async use(next: Next): Promise<Response | undefined> {
          const requestId = `req-${Math.random().toString(36).slice(2)}`;
          await withLogContext({ requestId }, () => next());
          return undefined;
        }
      }

      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('request handled');
          return { ok: true };
        }
      }

      const app = createApp({
        http: { controllers: [TestController], middlewares: [RequestContextMiddleware] },
      });
      await app.ready();

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(200);

      const raw = consoleSpy.mock.calls[0]?.[0] as string;
      const logged = JSON.parse(raw) as Record<string, unknown>;
      expect(logged['requestId']).toMatch(/^req-/);
    });
  });

  describe('custom config', () => {
    it('respects log level from custom config', async () => {
      @Config
      class ErrorOnlyConfig extends LoggerConfig {
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

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [ErrorOnlyConfig],
      });
      await app.ready();

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      const raw = consoleSpy.mock.calls[0]?.[0] as string;
      const logged = JSON.parse(raw) as Record<string, unknown>;
      expect(logged['level']).toBe('error');
    });

    it('supports multiple transports with different formatters', async () => {
      const secondTransportWrite = vi.fn();

      @Config
      class MultiTransportConfig extends LoggerConfig {
        constructor(
          private consoleTransport = inject(ConsoleTransport),
          private jsonlFormatter = inject(JsonlFormatter),
          private prettyFormatter = inject(PrettyFormatter),
        ) {
          super(consoleTransport, jsonlFormatter);
        }

        override get transports(): readonly TransportBinding[] {
          return Object.freeze([
            { transport: this.consoleTransport, formatter: this.jsonlFormatter },
            { transport: { write: secondTransportWrite }, formatter: this.prettyFormatter },
          ]);
        }
      }

      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('multi transport');
          return { ok: true };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [MultiTransportConfig],
      });
      await app.ready();

      await app.fetch(new Request('http://localhost/test'));

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(secondTransportWrite).toHaveBeenCalledTimes(1);

      const jsonlOutput = consoleSpy.mock.calls[0]?.[0] as string;
      const prettyOutput = secondTransportWrite.mock.calls[0]?.[0] as string;

      expect(() => JSON.parse(jsonlOutput) as unknown).not.toThrow();
      expect(prettyOutput).toContain('INFO');
    });
  });

  describe('child logger', () => {
    it('child logger preserves bindings across requests', async () => {
      @Controller('/test')
      class TestController {
        private serviceLogger: Logger;

        constructor(private logger = inject(Logger)) {
          this.serviceLogger = this.logger.child({ service: 'user-service' });
        }

        @Get('/')
        handle() {
          this.serviceLogger.info('processing', { action: 'create' });
          return { ok: true };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
      });
      await app.ready();

      await app.fetch(new Request('http://localhost/test'));

      const raw = consoleSpy.mock.calls[0]?.[0] as string;
      const logged = JSON.parse(raw) as Record<string, unknown>;
      expect(logged['service']).toBe('user-service');
      expect(logged['action']).toBe('create');
    });
  });
});
