import { HTTPException } from 'hono/http-exception';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RuntimeApp } from '../../../app';
import { createApp } from '../../../app';
import { Config } from '../../../built-in-service/config';
import { EnvAdaptor } from '../../../built-in-service/env/env.adaptor';
import { BadRequestException } from '../http.exceptions';

import { DefaultErrorHandler } from './default.error-handler';

let handler: DefaultErrorHandler;
let devHandler: DefaultErrorHandler;
let prodRuntimeApp: RuntimeApp<[]>;
let devRuntimeApp: RuntimeApp<[]>;

const setupHandlers = async () => {
  @Config
  class ProdEnvAdaptor extends EnvAdaptor {
    override get(key: string) {
      return key === 'NODE_ENV' ? 'production' : undefined;
    }
  }

  @Config
  class DevEnvAdaptor extends EnvAdaptor {
    override get(key: string) {
      return key === 'NODE_ENV' ? 'development' : undefined;
    }
  }

  const prodApp = createApp([], { configs: [ProdEnvAdaptor] });
  prodRuntimeApp = await prodApp.createRuntime();
  handler = await prodRuntimeApp.get(DefaultErrorHandler);

  const devApp = createApp([], { configs: [DevEnvAdaptor] });
  devRuntimeApp = await devApp.createRuntime();
  devHandler = await devRuntimeApp.get(DefaultErrorHandler);
};

const dummyContext = {} as Parameters<DefaultErrorHandler['onError']>[1];

describe('DefaultErrorHandler', () => {
  beforeAll(async () => {
    await setupHandlers();
  });

  afterAll(async () => {
    await prodRuntimeApp.shutdown();
    await devRuntimeApp.shutdown();
  });

  describe('HTTPException with res (defineHttpException pattern)', () => {
    it('returns JSON response from BadRequestException', async () => {
      const err = new BadRequestException({ reason: 'invalid input' });

      const res = handler.onError(err, dummyContext);

      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/json');
      await expect(res.json()).resolves.toEqual({
        code: 'BAD_REQUEST',
        message: 'invalid input',
      });
    });

    it('preserves custom res from HTTPException', async () => {
      const err = new HTTPException(409, {
        res: Response.json({ code: 'CONFLICT', detail: 'duplicate' }, { status: 409 }),
      });

      const res = handler.onError(err, dummyContext);

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        code: 'CONFLICT',
        detail: 'duplicate',
      });
    });
  });

  describe('generic Error', () => {
    it('hides message in production', async () => {
      const err = new Error('secret details');

      const res = handler.onError(err, dummyContext);

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        code: 'INTERNAL_ERROR',
        message: 'internal server error',
      });
    });

    it('exposes message in development', async () => {
      const err = new Error('something broke');

      const res = devHandler.onError(err, dummyContext);

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({
        code: 'INTERNAL_ERROR',
        message: 'something broke',
      });
    });
  });
});
