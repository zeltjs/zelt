import { describe, expect, it } from 'vitest';
import {
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
  defineClassDecorator,
  defineMethodDecorator,
  definePropertyDecorator,
} from '../runtime/decorators';
import type { Position } from '../runtime/position';
import { getCallerPosition } from '../runtime/position';
import {
  getClassMetadata,
  setClassMetadata,
  setMethodMetadata,
  setPropertyMetadata,
} from '../runtime/store';

describe('getCallerPosition', () => {
  it('returns position with sourceFile, line, column', () => {
    const pos = getCallerPosition();

    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toContain('runtime.test.ts');
    expect(typeof pos?.line).toBe('number');
    expect(typeof pos?.column).toBe('number');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
  });

  // Some sandboxed runtimes (and certain instrumentation libraries) override
  // Error.prototype.stack to block stack inspection. Returning undefined keeps
  // metadata capture optional rather than crashing.
  it('returns undefined when Error.prototype.stack is overridden', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
    Object.defineProperty(Error.prototype, 'stack', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    try {
      expect(getCallerPosition()).toBeUndefined();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Error.prototype, 'stack', originalDescriptor);
      } else {
        delete (Error.prototype as { stack?: unknown }).stack;
      }
    }
  });

  it('accepts custom isFrameworkPath filter to skip wrapper layers', () => {
    // All paths treated as framework → nothing to capture
    const allFramework = getCallerPosition({ isFrameworkPath: () => true });
    expect(allFramework).toBeUndefined();

    // Custom filter completely replaces the default: it must include
    // node_modules itself, otherwise vitest internals will leak through.
    const skipTestAndNodeModules = getCallerPosition({
      isFrameworkPath: (p) => p.includes('runtime.test.ts') || p.includes('/node_modules/'),
    });
    expect(skipTestAndNodeModules).toBeUndefined();
  });
});

describe('metadata store', () => {
  const mockPos: Position = { sourceFile: '/test.ts', line: 10, column: 1 };

  it('stores and retrieves class metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockPos, { basePath: '/api' });
    const meta = getClassMetadata(TestClass);

    expect(meta).toEqual({
      pos: mockPos,
      props: [{ basePath: '/api' }],
      methods: [],
      properties: [],
    });
  });

  it('stores and retrieves method metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockPos, {});
    setMethodMetadata(TestClass, 'getUser', mockPos, { method: 'GET' });

    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]).toEqual({
      name: 'getUser',
      pos: mockPos,
      props: [{ method: 'GET' }],
    });
  });

  it('stores and retrieves property metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockPos, {});
    setPropertyMetadata(TestClass, 'name', mockPos, { nullable: false });

    const meta = getClassMetadata(TestClass);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]).toEqual({
      name: 'name',
      pos: mockPos,
      props: [{ nullable: false }],
    });
  });

  it('returns undefined for class without metadata', () => {
    class NoMetaClass {}
    expect(getClassMetadata(NoMetaClass)).toBeUndefined();
  });

  it('accepts undefined pos and still stores metadata', () => {
    class TestClass {}
    setClassMetadata(TestClass, undefined, { kind: 'X' });
    const meta = getClassMetadata(TestClass);
    expect(meta?.pos).toBeUndefined();
    expect(meta?.props).toEqual([{ kind: 'X' }]);
  });

  it('appends props when the same class is decorated multiple times', () => {
    class TestClass {}
    setClassMetadata(TestClass, mockPos, { decorator: 'Controller', basePath: '/api' });
    setClassMetadata(TestClass, mockPos, { decorator: 'UseMiddleware', middlewares: ['auth'] });
    const meta = getClassMetadata(TestClass);
    expect(meta?.props).toEqual([
      { decorator: 'Controller', basePath: '/api' },
      { decorator: 'UseMiddleware', middlewares: ['auth'] },
    ]);
  });

  it('appends props when the same method receives multiple decorators', () => {
    class TestClass {}
    setMethodMetadata(TestClass, 'handler', mockPos, { decorator: 'Route', method: 'GET' });
    setMethodMetadata(TestClass, 'handler', mockPos, { decorator: 'Authorized', roles: ['admin'] });
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
    expect(meta?.pos?.sourceFile).toContain('runtime.test.ts');
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
  it('defineClassDecorator accepts injected pos and saves metadata', () => {
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Controller = (basePath: string) =>
      defineClassDecorator(fakePos, { decorator: 'Controller', basePath });

    @Controller('/api')
    class Foo {}

    const meta = getClassMetadata(Foo);
    expect(meta?.pos).toEqual(fakePos);
    expect(meta?.props).toEqual([{ decorator: 'Controller', basePath: '/api' }]);
  });

  it('defineClassDecorator with undefined pos still saves metadata', () => {
    const Controller = () => defineClassDecorator(undefined, { decorator: 'Controller' });

    @Controller()
    class Foo {}

    const meta = getClassMetadata(Foo);
    expect(meta?.pos).toBeUndefined();
    expect(meta?.props).toEqual([{ decorator: 'Controller' }]);
  });

  it('defineMethodDecorator rejectStatic throws via injected error factory on static methods', () => {
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Get = () =>
      defineMethodDecorator(
        fakePos,
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
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Tag = () => defineMethodDecorator(fakePos, { decorator: 'Tag' });

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
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Once = () =>
      defineClassDecorator(
        fakePos,
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
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Marker = () =>
      defineClassDecorator(fakePos, { decorator: 'Marker' }, { rejectIfApplied: () => undefined });

    @Marker()
    class Foo {}

    expect(getClassMetadata(Foo)?.props).toEqual([{ decorator: 'Marker' }]);
  });

  it('defineClassDecorator stacks multiple decorators by appending props', () => {
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Controller = (basePath: string) =>
      defineClassDecorator(fakePos, { decorator: 'Controller', basePath });
    const UseAuth = () => defineClassDecorator(fakePos, { decorator: 'UseAuth' });

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
    const fakePos: Position = { sourceFile: '/legacy.ts', line: 1, column: 1 };

    it('legacy class decorator stores metadata and returns the target', () => {
      class Foo {}
      const apply = defineClassDecorator(fakePos, { decorator: 'Controller', basePath: '/x' });
      const result = (apply as unknown as (target: unknown) => unknown)(Foo);
      expect(result).toBe(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.props).toEqual([{ decorator: 'Controller', basePath: '/x' }]);
    });

    it('legacy instance method flushes via legacy class decorator', () => {
      class Foo {}
      const method = defineMethodDecorator(fakePos, { decorator: 'Route', method: 'GET' });
      (method as unknown as (target: unknown, name: string, desc: object) => void)(
        Foo.prototype,
        'handler',
        { value: () => {} },
      );
      const cls = defineClassDecorator(fakePos, { decorator: 'Controller' });
      (cls as unknown as (target: unknown) => void)(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.methods).toHaveLength(1);
      expect(meta?.methods[0]?.name).toBe('handler');
      expect(meta?.methods[0]?.props).toEqual([{ decorator: 'Route', method: 'GET' }]);
    });

    it('legacy static method invokes rejectStatic factory', () => {
      class Foo {}
      const method = defineMethodDecorator(
        fakePos,
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
      const field = definePropertyDecorator(fakePos, { decorator: 'Column', nullable: false });
      (field as unknown as (target: unknown, name: string) => void)(Foo.prototype, 'name');
      const cls = defineClassDecorator(fakePos, { decorator: 'Container' });
      (cls as unknown as (target: unknown) => void)(Foo);
      const meta = getClassMetadata(Foo);
      expect(meta?.properties).toHaveLength(1);
      expect(meta?.properties[0]?.name).toBe('name');
      expect(meta?.properties[0]?.props).toEqual([{ decorator: 'Column', nullable: false }]);
    });

    it('TC39 class decorator returns undefined to avoid replacement', () => {
      const apply = defineClassDecorator(fakePos, { decorator: 'Controller' });
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
    const fakePos: Position = { sourceFile: '/inject.ts', line: 1, column: 1 };
    const Container = () => defineClassDecorator(fakePos, { decorator: 'Container' });
    const Column = (opts?: { nullable?: boolean }) =>
      definePropertyDecorator(fakePos, { decorator: 'Column', nullable: opts?.nullable ?? false });

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
