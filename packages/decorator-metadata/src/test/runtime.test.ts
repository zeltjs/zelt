/* eslint-disable complexity */
import { describe, expect, it } from 'vitest';
import {
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
  defineClassDecorator,
  defineMethodDecorator,
  definePropertyDecorator,
} from '../runtime/decorators';
import type { StackTrace } from '../runtime/position';
import { captureStackTrace, resolvePosition } from '../runtime/position';
import {
  getClassMetadata,
  setClassMetadata,
  setMethodMetadata,
  setPropertyMetadata,
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

  it('stores and retrieves class metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockTrace, { basePath: '/api' });
    const meta = getClassMetadata(TestClass);

    expect(meta?.trace).toBe(mockTrace);
    expect(meta?.props).toEqual([{ basePath: '/api' }]);
    expect(meta?.methods).toEqual([]);
    expect(meta?.properties).toEqual([]);
  });

  it('stores and retrieves method metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockTrace, {});
    setMethodMetadata(TestClass, 'getUser', mockTrace, { method: 'GET' });

    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.name).toBe('getUser');
    expect(meta?.methods[0]?.trace).toBe(mockTrace);
    expect(meta?.methods[0]?.props).toEqual([{ method: 'GET' }]);
  });

  it('stores and retrieves property metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockTrace, {});
    setPropertyMetadata(TestClass, 'name', mockTrace, { nullable: false });

    const meta = getClassMetadata(TestClass);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]?.name).toBe('name');
    expect(meta?.properties[0]?.trace).toBe(mockTrace);
    expect(meta?.properties[0]?.props).toEqual([{ nullable: false }]);
  });

  it('returns undefined for class without metadata', () => {
    class NoMetaClass {}
    expect(getClassMetadata(NoMetaClass)).toBeUndefined();
  });

  it('accepts undefined trace and still stores metadata', () => {
    class TestClass {}
    setClassMetadata(TestClass, undefined, { kind: 'X' });
    const meta = getClassMetadata(TestClass);
    expect(meta?.trace).toBeUndefined();
    expect(meta?.props).toEqual([{ kind: 'X' }]);
  });

  it('appends props when the same class is decorated multiple times', () => {
    class TestClass {}
    setClassMetadata(TestClass, mockTrace, { decorator: 'Controller', basePath: '/api' });
    setClassMetadata(TestClass, mockTrace, { decorator: 'UseMiddleware', middlewares: ['auth'] });
    const meta = getClassMetadata(TestClass);
    expect(meta?.props).toEqual([
      { decorator: 'Controller', basePath: '/api' },
      { decorator: 'UseMiddleware', middlewares: ['auth'] },
    ]);
  });

  it('appends props when the same method receives multiple decorators', () => {
    class TestClass {}
    setMethodMetadata(TestClass, 'handler', mockTrace, { decorator: 'Route', method: 'GET' });
    setMethodMetadata(TestClass, 'handler', mockTrace, {
      decorator: 'Authorized',
      roles: ['admin'],
    });
    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]?.props).toEqual([
      { decorator: 'Route', method: 'GET' },
      { decorator: 'Authorized', roles: ['admin'] },
    ]);
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
    const pos = resolvePosition(meta?.trace);
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

describe('define* primitives', () => {
  it('defineClassDecorator accepts injected trace and saves metadata', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Controller = (basePath: string) =>
      defineClassDecorator(fakeTrace, { decorator: 'Controller', basePath });

    @Controller('/api')
    class Foo {}

    const meta = getClassMetadata(Foo);
    expect(meta?.trace).toBe(fakeTrace);
    expect(meta?.props).toEqual([{ decorator: 'Controller', basePath: '/api' }]);
  });

  it('defineClassDecorator with undefined trace still saves metadata', () => {
    const Controller = () => defineClassDecorator(undefined, { decorator: 'Controller' });

    @Controller()
    class Foo {}

    const meta = getClassMetadata(Foo);
    expect(meta?.trace).toBeUndefined();
    expect(meta?.props).toEqual([{ decorator: 'Controller' }]);
  });

  it('defineMethodDecorator rejectStatic throws via injected error factory on static methods', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Get = () =>
      defineMethodDecorator(
        fakeTrace,
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

  it('defineMethodDecorator without rejectStatic accepts static methods', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Tag = () => defineMethodDecorator(fakeTrace, { decorator: 'Tag' });

    class Foo {
      @Tag()
      static handler() {}
    }

    // No metadata is captured because static methods don't share the class's
    // context.metadata, but no throw either.
    const meta = getClassMetadata(Foo);
    // Either no methods at all, or no Tag prop captured — both acceptable.
    expect(meta?.methods.find((m) => m.name === 'handler')).toBeUndefined();
  });

  it('defineClassDecorator rejectIfApplied callback can veto a second application', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Once = () =>
      defineClassDecorator(
        fakeTrace,
        { decorator: 'Once' },
        {
          rejectIfApplied: (existing) =>
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

  it('defineClassDecorator rejectIfApplied returns undefined when no conflict', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Marker = () =>
      defineClassDecorator(
        fakeTrace,
        { decorator: 'Marker' },
        { rejectIfApplied: () => undefined },
      );

    @Marker()
    class Foo {}

    expect(getClassMetadata(Foo)?.props).toEqual([{ decorator: 'Marker' }]);
  });

  it('defineClassDecorator stacks multiple decorators by appending props', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Controller = (basePath: string) =>
      defineClassDecorator(fakeTrace, { decorator: 'Controller', basePath });
    const UseAuth = () => defineClassDecorator(fakeTrace, { decorator: 'UseAuth' });

    @UseAuth()
    @Controller('/users')
    class Foo {}

    const meta = getClassMetadata(Foo);
    expect(meta?.props).toEqual([
      { decorator: 'Controller', basePath: '/users' },
      { decorator: 'UseAuth' },
    ]);
  });

  // The decorator factories below are invoked directly (without `@`) so the
  // tests don't depend on `experimentalDecorators` being enabled for tsx.
  // Each test exercises the legacy-style call signature: classes get `(target)`,
  // instance methods get `(prototype, name, descriptor)`, static methods get
  // `(class, name, descriptor)`, and fields get `(prototype, name)`.
  describe('legacy decorator support', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };

    it('legacy class decorator stores metadata and returns the target', () => {
      class Foo {}
      const apply = defineClassDecorator(fakeTrace, { decorator: 'Controller', basePath: '/x' });
      const result = (apply as unknown as (target: unknown) => unknown)(Foo);
      expect(result).toBe(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.props).toEqual([{ decorator: 'Controller', basePath: '/x' }]);
    });

    it('legacy instance method flushes via legacy class decorator', () => {
      class Foo {}
      const method = defineMethodDecorator(fakeTrace, { decorator: 'Route', method: 'GET' });
      (method as unknown as (target: unknown, name: string, desc: object) => void)(
        Foo.prototype,
        'handler',
        { value: () => {} },
      );
      const cls = defineClassDecorator(fakeTrace, { decorator: 'Controller' });
      (cls as unknown as (target: unknown) => void)(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.methods).toHaveLength(1);
      expect(meta?.methods[0]?.name).toBe('handler');
      expect(meta?.methods[0]?.props).toEqual([{ decorator: 'Route', method: 'GET' }]);
    });

    it('legacy static method invokes rejectStatic factory', () => {
      class Foo {}
      const method = defineMethodDecorator(
        fakeTrace,
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
      const field = definePropertyDecorator(fakeTrace, { decorator: 'Column', nullable: false });
      (field as unknown as (target: unknown, name: string) => void)(Foo.prototype, 'name');
      const cls = defineClassDecorator(fakeTrace, { decorator: 'Container' });
      (cls as unknown as (target: unknown) => void)(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.properties).toHaveLength(1);
      expect(meta?.properties[0]?.name).toBe('name');
      expect(meta?.properties[0]?.props).toEqual([{ decorator: 'Column', nullable: false }]);
    });

    it('TC39 class decorator returns undefined to avoid replacement', () => {
      const apply = defineClassDecorator(fakeTrace, { decorator: 'Controller' });
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

  it('definePropertyDecorator accepts injected pos', () => {
    const fakeTrace: StackTrace = { _brand: 'StackTrace', error: new Error() };
    const Container = () => defineClassDecorator(fakeTrace, { decorator: 'Container' });
    const Column = (opts?: { nullable?: boolean }) =>
      definePropertyDecorator(fakeTrace, {
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
/* eslint-enable complexity */
