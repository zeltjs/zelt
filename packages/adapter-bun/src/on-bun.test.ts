import { Command, Controller, cliSchema, command, createApp, Get, http } from '@zeltjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { onBun } from './on-bun';

const originalBun = globalThis.Bun;
let servedFetch: ((request: Request) => Promise<Response>) | undefined;
const serveMock = vi.fn(
  (options: {
    readonly fetch: (request: Request) => Promise<Response>;
    readonly port?: number;
    readonly hostname?: string;
  }) => {
    servedFetch = options.fetch;
    return {
      hostname: options.hostname,
      port: options.port,
      stop: vi.fn(),
    };
  },
);

beforeAll(() => {
  Object.defineProperty(globalThis, 'Bun', {
    configurable: true,
    value: { argv: ['bun', 'test'], env: {}, serve: serveMock },
  });
});

beforeEach(() => {
  servedFetch = undefined;
  serveMock.mockClear();
});

afterAll(() => {
  Object.defineProperty(globalThis, 'Bun', {
    configurable: true,
    value: originalBun,
  });
});

describe('onBun return types', () => {
  it('narrows adapter methods from configured features and keeps feature capabilities working', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const httpFeature = http({ controllers: [TestController] });
    const httpOnly = await onBun(createApp([httpFeature]));

    expectTypeOf(httpOnly).toHaveProperty('serve');
    expectTypeOf(httpOnly).not.toHaveProperty('execCommand');

    const directResponse = await httpOnly.http.fetch(new Request('http://localhost/'));
    await expect(directResponse.json()).resolves.toEqual({ ok: true });

    const handle = httpOnly.serve({ hostname: '127.0.0.1', port: 4321 });
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '127.0.0.1', port: 4321 }),
    );
    expect(handle.address).toEqual({ hostname: '127.0.0.1', port: 4321 });
    if (!servedFetch) throw new Error('expected Bun.serve fetch');
    const servedResponse = await servedFetch(new Request('http://localhost/'));
    await expect(servedResponse.json()).resolves.toEqual({ ok: true });

    await handle.shutdown();

    const runFn = vi.fn();
    class TestCommand {
      static schema = cliSchema({});
      run() {
        runFn();
      }
    }
    Command({ name: 'test' })(TestCommand);

    const commandFeature = command([TestCommand]);
    const commandOnly = await onBun(createApp([commandFeature]));

    expectTypeOf(commandOnly).toHaveProperty('commands');
    expectTypeOf(commandOnly).not.toHaveProperty('serve');

    const commandResult = await commandOnly.commands.execCommand(['test']);
    expect(commandResult.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalledOnce();

    await commandOnly.shutdown();

    const full = await onBun(createApp([httpFeature, commandFeature]));

    expectTypeOf(full).toHaveProperty('serve');
    expectTypeOf(full).toHaveProperty('commands');

    const fullResult = await full.commands.execCommand(['test']);
    expect(fullResult.exitCode).toBe(0);

    await full.shutdown();
  });
});
