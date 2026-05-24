import { Container } from '@needle-di/core';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { ErrorHandler } from './error-handler';

describe('@ErrorHandler', () => {
  it('makes class injectable and resolvable by container', () => {
    @ErrorHandler
    class TestErrorHandler {
      onError(_error: Error, _c: Context) {
        return Response.json({ error: 'handled' }, { status: 500 });
      }
    }

    const container = new Container();
    const instance = container.get(TestErrorHandler);
    expect(instance).toBeInstanceOf(TestErrorHandler);
    expect(typeof instance.onError).toBe('function');
  });

  it('preserves class identity after decoration', () => {
    @ErrorHandler
    class CustomErrorHandler {
      onError(_error: Error, _c: Context) {
        return undefined;
      }
    }

    expect(CustomErrorHandler.name).toBe('CustomErrorHandler');
  });
});
