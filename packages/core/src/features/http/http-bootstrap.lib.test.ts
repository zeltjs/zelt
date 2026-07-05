import { describe, expect, it, vi } from 'vitest';
import type { LifecycleManager } from '../../kernel';
import { runInContext } from '../../kernel';
import { createBootstrapMiddleware, createRequestRootChecker } from './http-bootstrap.lib';
import { registerAfterResponseCallback } from './request';

describe('createRequestRootChecker', () => {
  it('treats an existing non-request context without a store creator as request root', () => {
    const isRoot = createRequestRootChecker(Symbol('router'));

    runInContext(() => {
      expect(isRoot()).toBe(true);
    });
  });
});

describe('createBootstrapMiddleware', () => {
  it('flushes after-response callbacks when the request pipeline throws', async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = {
        startupPending: vi.fn().mockResolvedValue(undefined),
      } as unknown as LifecycleManager;
      const error = new Error('after-response failed');
      const callback = vi.fn(async () => {
        throw error;
      });
      const onAfterResponseError = vi.fn();
      const middleware = createBootstrapMiddleware(
        lifecycle,
        Symbol('router'),
        onAfterResponseError,
      );

      await expect(
        middleware({ req: { raw: new Request('https://example.test/') } } as never, async () => {
          registerAfterResponseCallback(callback);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      await vi.runOnlyPendingTimersAsync();
      expect(callback).toHaveBeenCalledOnce();
      expect(onAfterResponseError).toHaveBeenCalledWith(error);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forwards a synchronously throwing waitUntil hook to the error handler without failing the request', async () => {
    const lifecycle = {
      startupPending: vi.fn().mockResolvedValue(undefined),
    } as unknown as LifecycleManager;
    const onAfterResponseError = vi.fn();
    const error = new Error('waitUntil rejected registration');
    const waitUntil = vi.fn(() => {
      throw error;
    });
    const next = vi.fn(async () => {});
    const middleware = createBootstrapMiddleware(
      lifecycle,
      Symbol('router'),
      onAfterResponseError,
      waitUntil,
    );

    await expect(
      middleware({ req: { raw: new Request('https://example.test/') } } as never, next),
    ).resolves.toBeUndefined();

    expect(next).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(onAfterResponseError).toHaveBeenCalledWith(error);
  });

  it('forwards after-response callback rejections to the provided error handler', async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = {
        startupPending: vi.fn().mockResolvedValue(undefined),
      } as unknown as LifecycleManager;
      const onAfterResponseError = vi.fn();
      const error = new Error('boom');
      const middleware = createBootstrapMiddleware(
        lifecycle,
        Symbol('router'),
        onAfterResponseError,
      );

      await middleware(
        { req: { raw: new Request('https://example.test/') } } as never,
        async () => {
          registerAfterResponseCallback(async () => {
            throw error;
          });
        },
      );

      await vi.runOnlyPendingTimersAsync();
      expect(onAfterResponseError).toHaveBeenCalledWith(error);
    } finally {
      vi.useRealTimers();
    }
  });
});
