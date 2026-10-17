import {
  Controller,
  createApp,
  Get,
  http,
  Injectable,
  injectFeature,
  response,
} from '@zeltjs/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LambdaHandlerV1, LambdaHandlerV2 } from './index';
import { LambdaHandlerFeature, lambdaHandler, onLambda } from './index';
import { context, eventV1, eventV2 } from './test-fixtures/api-gateway';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return response().text('hello from lambda');
  }
}

@Controller('/hello')
class AdminController {
  @Get('/')
  greet() {
    return response().text('admin');
  }
}

describe('lambdaHandler', () => {
  it('creates a v2 handler for the explicitly supplied HTTP feature', async () => {
    const lambdaApp = await onLambda(
      createApp([http({ controllers: [HelloController] }), lambdaHandler()]),
    );
    try {
      const handler = lambdaApp.handler.create(lambdaApp.http);
      expectTypeOf(handler).toEqualTypeOf<LambdaHandlerV2>();
      expectTypeOf(
        lambdaApp.handler.create(lambdaApp.http, { payloadFormat: '2.0' }),
      ).toEqualTypeOf<LambdaHandlerV2>();
      expect(await handler(eventV2, context)).toMatchObject({
        statusCode: 200,
        body: 'hello from lambda',
        isBase64Encoded: false,
      });
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('supports v1 with a distinct event and result type', async () => {
    const lambdaApp = await onLambda(
      createApp([http({ controllers: [HelloController] }), lambdaHandler()]),
    );
    try {
      const handler = lambdaApp.handler.create(lambdaApp.http, { payloadFormat: '1.0' });
      expectTypeOf(handler).toEqualTypeOf<LambdaHandlerV1>();
      expect(await handler(eventV1, context)).toMatchObject({
        statusCode: 200,
        body: 'hello from lambda',
        isBase64Encoded: false,
      });
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('connects multiple named HTTP features independently without a default HTTP', async () => {
    const lambdaApp = await onLambda(
      createApp([
        http({ name: 'public', controllers: [HelloController] }),
        http({ name: 'admin', controllers: [AdminController] }),
        lambdaHandler({ name: 'gateway' }),
      ]),
    );
    try {
      expectTypeOf(lambdaApp).not.toHaveProperty('http');
      expectTypeOf(lambdaApp).not.toHaveProperty('handler');
      const publicHandler = lambdaApp.gateway.create(lambdaApp.public);
      const adminHandler = lambdaApp.gateway.create(lambdaApp.admin);
      expect(await publicHandler(eventV2, context)).toMatchObject({ body: 'hello from lambda' });
      expect(await adminHandler(eventV2, context)).toMatchObject({ body: 'admin' });
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('shares the realized feature with injection and rejects calls after shutdown', async () => {
    const gateway = lambdaHandler();
    @Injectable()
    class Consumer {
      readonly gateway = injectFeature(gateway);
    }
    const lambdaApp = await onLambda(
      createApp([gateway, http({ controllers: [HelloController] })]),
    );
    try {
      expect((await lambdaApp.get(Consumer)).gateway).toBe(lambdaApp.handler);
      expect(lambdaApp.getFeatureEntries(LambdaHandlerFeature)[0]?.capabilities).toBe(
        lambdaApp.handler,
      );
      const create = lambdaApp.handler.create;
      const handler = create(lambdaApp.http);
      await lambdaApp.shutdown();
      expect(() => create(lambdaApp.http)).toThrow(/disposed/);
      await expect(handler(eventV2, context)).rejects.toThrow(/disposed/);
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('converts v2 request URLs, headers and base64 bodies and encodes binary responses', async () => {
    const lambdaApp = await onLambda(createApp([lambdaHandler()]));
    try {
      const handler = lambdaApp.handler.create({
        fetch: async (request) => {
          expect(request.url).toBe('https://example.com/hello?q=a%20b');
          expect(request.method).toBe('POST');
          expect(request.headers.get('content-type')).toBe('application/octet-stream');
          const body = await request.arrayBuffer();
          expect(new Uint8Array(body)).toEqual(new Uint8Array([0, 128, 255]));
          return new Response(body, {
            status: 201,
            headers: { 'content-type': 'application/octet-stream', 'x-result': 'binary' },
          });
        },
      });
      expect(
        await handler(
          {
            ...eventV2,
            rawQueryString: 'q=a%20b',
            headers: { ...eventV2.headers, 'content-type': 'application/octet-stream' },
            body: 'AID/',
            isBase64Encoded: true,
            requestContext: {
              ...eventV2.requestContext,
              http: { ...eventV2.requestContext.http, method: 'POST' },
            },
          },
          context,
        ),
      ).toEqual({
        statusCode: 201,
        body: 'AID/',
        headers: { 'content-type': 'application/octet-stream', 'x-result': 'binary' },
        isBase64Encoded: true,
      });
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('converts v1 request URLs, headers and text bodies into HTTP', async () => {
    const lambdaApp = await onLambda(createApp([lambdaHandler()]));
    try {
      const handler = lambdaApp.handler.create(
        {
          fetch: async (request) => {
            expect(request.url).toBe('https://example.com/hello?q=a+b');
            expect(request.method).toBe('POST');
            expect(request.headers.get('content-type')).toBe('text/plain');
            return new Response(await request.text(), { status: 202 });
          },
        },
        { payloadFormat: '1.0' },
      );
      expect(
        await handler(
          {
            ...eventV1,
            httpMethod: 'POST',
            headers: { ...eventV1.headers, 'content-type': 'text/plain' },
            queryStringParameters: { q: 'a b' },
            body: 'hello',
          },
          context,
        ),
      ).toMatchObject({ statusCode: 202, body: 'hello', isBase64Encoded: false });
    } finally {
      await lambdaApp.shutdown();
    }
  });

  it('propagates errors from the supplied HTTP handler', async () => {
    const lambdaApp = await onLambda(createApp([lambdaHandler()]));
    try {
      const error = new Error('HTTP processing failed');
      const handler = lambdaApp.handler.create({ fetch: () => Promise.reject(error) });
      await expect(handler(eventV2, context)).rejects.toBe(error);
    } finally {
      await lambdaApp.shutdown();
    }
  });
});
