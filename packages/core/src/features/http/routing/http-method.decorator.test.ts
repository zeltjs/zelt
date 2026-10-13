import { describe, expect, expectTypeOf, it } from 'vitest';
import { Controller } from './controller.decorator';
import { Delete, Get, Patch, Post, Put } from './http-method.decorator';
import { getRouteMetadata } from './routing-metadata.lib';

describe('HTTP method decorators', () => {
  it('registers GET / POST / PUT / PATCH / DELETE in declaration order', () => {
    @Controller('/')
    class C {
      @Get('/')
      list() {}
      @Get('/:id')
      show() {}
      @Post('/')
      create() {}
      @Put('/:id')
      replace() {}
      @Patch('/:id')
      update() {}
      @Delete('/:id')
      destroy() {}
    }
    expect(getRouteMetadata(C)).toEqual([
      { method: 'GET', path: '/', methodName: 'list' },
      { method: 'GET', path: '/:id', methodName: 'show' },
      { method: 'POST', path: '/', methodName: 'create' },
      { method: 'PUT', path: '/:id', methodName: 'replace' },
      { method: 'PATCH', path: '/:id', methodName: 'update' },
      { method: 'DELETE', path: '/:id', methodName: 'destroy' },
    ]);
  });

  it('rejects static methods', () => {
    expect(() => {
      @Controller('/')
      class S {
        @Get('/')
        static foo() {
          return null;
        }
      }
      void S;
    }).toThrow(/static/);
  });

  it('checks asynchronous and mixed native Response return types', () => {
    const checkInvalidReturns = () => {
      @Controller('/')
      class InvalidReturns {
        // @ts-expect-error An asynchronous native Response is not an HTTP reply contract.
        @Get('/async')
        async native() {
          return new Response('unsupported');
        }

        // @ts-expect-error A native Response cannot be hidden in a union with JSON data.
        @Get('/mixed')
        mixed() {
          return Math.random() > 0.5 ? new Response('unsupported') : { ok: true };
        }
      }
      void InvalidReturns;
    };
    expectTypeOf(checkInvalidReturns).toBeFunction();
  });
});
