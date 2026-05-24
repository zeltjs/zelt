/* biome-ignore-all lint/complexity/noStaticOnlyClass: test fixtures */
import { describe, expect, it } from 'vitest';

import { getSourcePosition } from '../inspect/source-position';
import {
  composeClassDecorators,
  composeMethodDecorators,
  composePropertyDecorators,
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
} from '../runtime/decorators';
import type { StackTrace } from '../runtime/position';
import { captureStackTrace, resolvePosition } from '../runtime/position';
import {
  aggregateMembers,
  getClassMetadata,
  recordClass,
  recordMethod,
  recordProperty,
} from '../runtime/store';

describe('captureStackTrace and resolvePosition', () => {
  it('captureStackTrace returns StackTrace with error', () => {
    const trace = captureStackTrace();
    expect(trace).toBeDefined();
    expect(trace?.error).toBeInstanceOf(Error);
  });

  it('resolvePosition extracts position from trace', () => {
    const trace = captureStackTrace();
    const pos = resolvePosition(trace);

    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toContain('runtime.test.ts');
    expect(typeof pos?.line).toBe('number');
    expect(typeof pos?.column).toBe('number');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
  });

  it('captureStackTrace returns undefined when Error.prototype.stack is overridden', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
    Object.defineProperty(Error.prototype, 'stack', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    try {
      expect(captureStackTrace()).toBeUndefined();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Error.prototype, 'stack', originalDescriptor);
      } else {
        delete (Error.prototype as { stack?: unknown }).stack;
      }
    }
  });

  it('resolvePosition accepts custom isFrameworkPath filter', () => {
    const trace = captureStackTrace();

    const allFramework = resolvePosition(trace, { isFrameworkPath: () => true });
    expect(allFramework).toBeUndefined();

    const skipTestAndNodeModules = resolvePosition(trace, {
      isFrameworkPath: (p) => p.includes('runtime.test.ts') || p.includes('/node_modules/'),
    });
    expect(skipTestAndNodeModules).toBeUndefined();
  });
});

describe('metadata store', () => {
  const mockTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };

  it('recordClass stores class metadata', () => {
    class TestClass {}
    const classKey = {};

    recordClass(TestClass, mockTrace, { basePath: '/api' });
    aggregateMembers(TestClass, classKey);
    const meta = getClassMetadata(TestClass);

    expect(meta?.props).toEqual([{ basePath: '/api' }]);
    expect(meta?.methods).toEqual([]);
    expect(meta?.properties).toEqual([]);
  });

  it('recordMethod + aggregateMembers stores method metadata', () => {
    class TestClass {}
    const classKey = {};

    recordMethod(classKey, 'getUser', mockTrace, { method: 'GET' });
    recordClass(TestClass, mockTrace, {});
    aggregateMembers(TestClass, classKey);

    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.name).toBe('getUser');
    expect(meta?.methods[0]?.props).toEqual([{ method: 'GET' }]);
  });

  it('recordMethod supports symbol-named methods', () => {
    class TestClass {}
    const classKey = {};
    const sym = Symbol('handler');

    recordMethod(classKey, sym, mockTrace, { method: 'POST' });
    recordClass(TestClass, mockTrace, {});
    aggregateMembers(TestClass, classKey);

    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.name).toBe(sym);
    expect(meta?.methods[0]?.props).toEqual([{ method: 'POST' }]);
  });

  it('recordProperty + aggregateMembers stores property metadata', () => {
    class TestClass {}
    const classKey = {};

    recordProperty(classKey, 'name', mockTrace, { nullable: false });
    recordClass(TestClass, mockTrace, {});
    aggregateMembers(TestClass, classKey);

    const meta = getClassMetadata(TestClass);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]?.name).toBe('name');
    expect(meta?.properties[0]?.props).toEqual([{ nullable: false }]);
  });

  it('recordProperty supports symbol-named properties', () => {
    class TestClass {}
    const classKey = {};
    const sym = Symbol('secret');

    recordProperty(classKey, sym, mockTrace, { encrypted: true });
    recordClass(TestClass, mockTrace, {});
    aggregateMembers(TestClass, classKey);

    const meta = getClassMetadata(TestClass);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]?.name).toBe(sym);
    expect(meta?.properties[0]?.props).toEqual([{ encrypted: true }]);
  });

  it('returns undefined for class without metadata', () => {
    class NoMetaClass {}
    expect(getClassMetadata(NoMetaClass)).toBeUndefined();
  });

  it('accepts undefined trace and still stores metadata', () => {
    class TestClass {}
    const classKey = {};
    recordClass(TestClass, undefined, { kind: 'X' });
    aggregateMembers(TestClass, classKey);
    const meta = getClassMetadata(TestClass);
    expect(meta?.props).toEqual([{ kind: 'X' }]);
  });

  it('appends props when the same class is decorated multiple times', () => {
    class TestClass {}
    const classKey = {};
    recordClass(TestClass, mockTrace, { decorator: 'Controller', basePath: '/api' });
    recordClass(TestClass, mockTrace, { decorator: 'UseMiddleware', middlewares: ['auth'] });
    aggregateMembers(TestClass, classKey);
    const meta = getClassMetadata(TestClass);
    expect(meta?.props).toEqual([
      { decorator: 'Controller', basePath: '/api' },
      { decorator: 'UseMiddleware', middlewares: ['auth'] },
    ]);
  });

  it('appends props when the same method receives multiple decorators', () => {
    class TestClass {}
    const classKey = {};
    recordMethod(classKey, 'handler', mockTrace, { decorator: 'Route', method: 'GET' });
    recordMethod(classKey, 'handler', mockTrace, {
      decorator: 'Authorized',
      roles: ['admin'],
    });
    recordClass(TestClass, mockTrace, {});
    aggregateMembers(TestClass, classKey);
    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.props).toEqual([
      { decorator: 'Route', method: 'GET' },
      { decorator: 'Authorized', roles: ['admin'] },
    ]);
  });
});

describe('trace capture timing', () => {
  it('createClassDecorator captures trace at decoration time, not factory time', () => {
    const Controller = (basePath: string) => createClassDecorator({ basePath });

    @Controller('/api')
    class TestClass {}

    const pos = getSourcePosition(TestClass);

    expect(pos?.sourceFile).toContain('runtime.test.ts');
    expect(pos?.line).toBeGreaterThan(0);
  });

  it('composeClassDecorators captures trace at decoration site, not child factory time', () => {
    const Controller = (path: string) => createClassDecorator({ path });
    const Marker = () => createClassDecorator({ type: 'marker' });

    const composeDefinitionLine = resolvePosition(captureStackTrace())?.line ?? 0;
    const GraphqlController = (path: string) => composeClassDecorators(Controller(path), Marker());

    @GraphqlController('/api')
    class UserResolver {}

    const meta = getClassMetadata(UserResolver);
    const pos = getSourcePosition(UserResolver);

    expect(pos?.sourceFile).toContain('runtime.test.ts');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.line).toBeGreaterThan(composeDefinitionLine);
    expect(meta?.props).toEqual([{ path: '/api' }, { type: 'marker' }]);
  });
});

describe('decorator factories', () => {
  it('createClassDecorator stores metadata on class', () => {
    const Controller = (basePath: string) => createClassDecorator({ basePath });

    @Controller('/users')
    class UserController {}

    const meta = getClassMetadata(UserController);
    expect(meta).toBeDefined();
    expect(meta?.props).toEqual([{ basePath: '/users' }]);
    const pos = getSourcePosition(UserController);
    expect(pos?.sourceFile).toContain('runtime.test.ts');
  });

  it('createClassDecorator works alone without method/property decorators', () => {
    const Service = () => createClassDecorator({ type: 'service' });

    @Service()
    class SimpleService {}

    const meta = getClassMetadata(SimpleService);
    expect(meta).toBeDefined();
    expect(meta?.props).toEqual([{ type: 'service' }]);
    expect(meta?.methods).toHaveLength(0);
    expect(meta?.properties).toHaveLength(0);
  });

  it('createMethodDecorator stores metadata on method', () => {
    const Controller = () => createClassDecorator({});
    const Get = (path: string) => createMethodDecorator({ method: 'GET', path });

    @Controller()
    class TestController {
      @Get('/items')
      getItems() {}
    }

    const meta = getClassMetadata(TestController);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.props).toEqual([{ method: 'GET', path: '/items' }]);
  });

  it('createPropertyDecorator stores metadata on property', () => {
    const Entity = () => createClassDecorator({});
    const Column = (opts?: { nullable?: boolean }) =>
      createPropertyDecorator({ nullable: opts?.nullable ?? false });

    @Entity()
    class User {
      @Column()
      name!: string;

      @Column({ nullable: true })
      email?: string;
    }

    const meta = getClassMetadata(User);
    expect(meta?.properties).toHaveLength(2);
    expect(meta?.properties[0]?.props).toEqual([{ nullable: false }]);
    expect(meta?.properties[1]?.props).toEqual([{ nullable: true }]);
  });
});

describe('create* options', () => {
  it('createClassDecorator captures trace at factory call time', () => {
    const Controller = () => createClassDecorator({ decorator: 'Controller' });

    @Controller()
    class Foo {}

    const meta = getClassMetadata(Foo);
    const pos = getSourcePosition(Foo);
    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toBeTruthy();
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
    expect(meta?.props).toEqual([{ decorator: 'Controller' }]);
  });

  it('createMethodDecorator rejectStatic throws on static methods', () => {
    const Get = () =>
      createMethodDecorator(
        { decorator: 'Route', method: 'GET' },
        { rejectStatic: () => new Error('static not allowed for GET') },
      );

    const apply = () => {
      class Foo {
        @Get()
        static handler() {}
      }
      void Foo;
    };

    expect(apply).toThrow(/static not allowed for GET/);
  });

  it('createMethodDecorator without rejectStatic accepts static methods', () => {
    const Tag = () => createMethodDecorator({ decorator: 'Tag' });

    class Foo {
      @Tag()
      static handler() {}
    }

    const meta = getClassMetadata(Foo);
    expect(meta?.methods.find((m) => m.name === 'handler')).toBeUndefined();
  });

  it('createClassDecorator rejectIfApplied callback can veto a second application', () => {
    const Once = () =>
      createClassDecorator(
        { decorator: 'Once' },
        {
          rejectIfApplied: (existing: readonly object[]) =>
            existing.some((p) => (p as { decorator?: string }).decorator === 'Once')
              ? new Error('Once already applied')
              : undefined,
        },
      );

    const apply = () => {
      @Once()
      @Once()
      class Foo {}
      void Foo;
    };

    expect(apply).toThrow(/Once already applied/);
  });

  it('createClassDecorator rejectIfApplied returns undefined when no conflict', () => {
    const Marker = () =>
      createClassDecorator({ decorator: 'Marker' }, { rejectIfApplied: () => undefined });

    @Marker()
    class Foo {}

    expect(getClassMetadata(Foo)?.props).toEqual([{ decorator: 'Marker' }]);
  });

  it('createClassDecorator stacks multiple decorators by appending props', () => {
    const Controller = (basePath: string) =>
      createClassDecorator({ decorator: 'Controller', basePath });
    const UseAuth = () => createClassDecorator({ decorator: 'UseAuth' });

    @UseAuth()
    @Controller('/users')
    class Foo {}

    const meta = getClassMetadata(Foo);
    expect(meta?.props).toEqual([
      { decorator: 'Controller', basePath: '/users' },
      { decorator: 'UseAuth' },
    ]);
  });

  describe('legacy decorator support', () => {
    it('legacy class decorator stores metadata and returns the target', () => {
      class Foo {}
      const apply = createClassDecorator({ decorator: 'Controller', basePath: '/x' });
      const result = (apply as unknown as (target: unknown) => unknown)(Foo);
      expect(result).toBe(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.props).toEqual([{ decorator: 'Controller', basePath: '/x' }]);
    });

    it('legacy instance method flushes via legacy class decorator', () => {
      class Foo {}
      const method = createMethodDecorator({ decorator: 'Route', method: 'GET' });
      (method as unknown as (target: unknown, name: string, desc: object) => void)(
        Foo.prototype,
        'handler',
        { value: () => {} },
      );
      const cls = createClassDecorator({ decorator: 'Controller' });
      (cls as unknown as (target: unknown) => void)(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.methods).toHaveLength(1);
      expect(meta?.methods[0]?.name).toBe('handler');
      expect(meta?.methods[0]?.props).toEqual([{ decorator: 'Route', method: 'GET' }]);
    });

    it('legacy static method invokes rejectStatic factory', () => {
      class Foo {}
      const method = createMethodDecorator(
        { decorator: 'Route' },
        { rejectStatic: () => new Error('static not allowed (legacy)') },
      );
      expect(() =>
        (method as unknown as (target: unknown, name: string, desc: object) => void)(
          Foo,
          'staticHandler',
          { value: () => {} },
        ),
      ).toThrow(/static not allowed \(legacy\)/);
    });

    it('legacy property decorator flushes via legacy class decorator', () => {
      class Foo {}
      const field = createPropertyDecorator({ decorator: 'Column', nullable: false });
      (field as unknown as (target: unknown, name: string) => void)(Foo.prototype, 'name');
      const cls = createClassDecorator({ decorator: 'Container' });
      (cls as unknown as (target: unknown) => void)(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.properties).toHaveLength(1);
      expect(meta?.properties[0]?.name).toBe('name');
      expect(meta?.properties[0]?.props).toEqual([{ decorator: 'Column', nullable: false }]);
    });

    it('TC39 class decorator returns undefined to avoid replacement', () => {
      const apply = createClassDecorator({ decorator: 'Controller' });
      class Foo {}
      const ctx: ClassDecoratorContext = {
        kind: 'class',
        name: 'Foo',
        addInitializer: () => {},
        metadata: {} as DecoratorMetadata,
      };
      const result = (apply as unknown as (value: unknown, ctx: ClassDecoratorContext) => unknown)(
        Foo,
        ctx,
      );
      expect(result).toBeUndefined();
    });
  });

  it('createPropertyDecorator saves metadata', () => {
    const Container = () => createClassDecorator({ decorator: 'Container' });
    const Column = (opts?: { nullable?: boolean }) =>
      createPropertyDecorator({
        decorator: 'Column',
        nullable: opts?.nullable ?? false,
      });

    @Container()
    class Foo {
      @Column()
      name!: string;
    }

    const meta = getClassMetadata(Foo);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]?.props).toEqual([{ decorator: 'Column', nullable: false }]);
  });
});
describe('compose* functions', () => {
  it('composeMethodDecorators combines multiple method decorators', () => {
    const Controller = () => createClassDecorator({});
    const Route = (method: string, path: string) =>
      createMethodDecorator({ decorator: 'Route', method, path });
    const Query = (path: string) =>
      composeMethodDecorators(Route('GET', path), createMethodDecorator({ decorator: 'Query' }));

    @Controller()
    class TestController {
      @Query('/users')
      getUsers() {}
    }

    const meta = getClassMetadata(TestController);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.props).toEqual([
      { decorator: 'Route', method: 'GET', path: '/users' },
      { decorator: 'Query' },
    ]);
  });

  it('composePropertyDecorators combines multiple property decorators', () => {
    const Entity = () => createClassDecorator({});
    const Column = (opts?: { nullable?: boolean }) =>
      createPropertyDecorator({ decorator: 'Column', nullable: opts?.nullable ?? false });
    const Searchable = () => createPropertyDecorator({ decorator: 'Searchable' });
    const SearchableColumn = (opts?: { nullable?: boolean }) =>
      composePropertyDecorators(Column(opts), Searchable());

    @Entity()
    class User {
      @SearchableColumn()
      name!: string;
    }

    const meta = getClassMetadata(User);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]?.props).toEqual([
      { decorator: 'Column', nullable: false },
      { decorator: 'Searchable' },
    ]);
  });
});
/* eslint-enable complexity */
