import { describe, expect, it } from 'vitest';
import { Controller } from './controller';
import { Delete, Get, Patch, Post, Put } from './http-method';
import { getRouteMetadata } from './metadata';

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
});
