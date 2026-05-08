import { describe, expect, it } from 'vitest';

import { getRouteMetadata, resolveRouteMetadata } from '../internal/metadata';

import { Delete, Get, Patch, Post, Put } from './http-method';

describe('HTTP method decorators (legacy form)', () => {
  it('registers GET / POST / PUT / PATCH / DELETE in declaration order', () => {
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
    // 2-phase initialization: method decorators store to pending, resolve moves to class
    resolveRouteMetadata(C.prototype, C);
    expect(getRouteMetadata(C)).toEqual([
      { method: 'GET', path: '/', methodName: 'list' },
      { method: 'GET', path: '/:id', methodName: 'show' },
      { method: 'POST', path: '/', methodName: 'create' },
      { method: 'PUT', path: '/:id', methodName: 'replace' },
      { method: 'PATCH', path: '/:id', methodName: 'update' },
      { method: 'DELETE', path: '/:id', methodName: 'destroy' },
    ]);
  });

  it('rejects static methods (target is the constructor itself)', () => {
    // legacy method decorator: instance method なら target は prototype、static なら target は class.
    // typeof target === 'function' で static を識別して throw する。
    expect(() => {
      class S {
        @Get('/')
        static foo() {
          return null;
        }
      }
      void S;
    }).toThrow(/static/);
  });

  // legacy decorator は private (#priv) には適用不可 (TS が syntax error にする)
  // ので runtime check は不要。test も省略。
});
