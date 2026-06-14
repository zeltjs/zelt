import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { createApp } from '../../../app';
import { http } from '../http.feature';
import { Controller } from '../routing/controller.decorator';
import { Post } from '../routing/http-method.decorator';
import { validated } from './injection';
import type { ValidatedMarker } from './validated.types';

type SchemaConfig<Output> = {
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>;
};

const createStandardSchema = <Output>({
  validate,
}: SchemaConfig<Output>): StandardSchemaV1<unknown, Output> => ({
  '~standard': {
    version: 1,
    vendor: 'zelt-test',
    validate,
    types: undefined as StandardSchemaV1.Types<unknown, Output> | undefined,
  },
});

const userSchema = createStandardSchema<{ name: string; age: number }>({
  validate: (value) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      'age' in value &&
      typeof value.name === 'string' &&
      typeof value.age === 'number'
    ) {
      return { value: { name: value.name, age: value.age } };
    }
    return { issues: [{ message: 'Invalid user' }] };
  },
});

describe('validated()', () => {
  it('returns Standard Schema output from JSON body by default', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = validated(userSchema)) {
        return data;
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', age: 36 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada', age: 36 });
  });

  it('returns Standard Schema output from JSON body with explicit json target', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = validated(userSchema, 'json')) {
        return data;
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', age: 36 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada', age: 36 });
  });

  it('returns Standard Schema output from form body', async () => {
    const formSchema = createStandardSchema<{ name: string }>({
      validate: (value) => {
        if (typeof value === 'object' && value !== null && 'name' in value) {
          return { value: { name: String(value.name) } };
        }
        return { issues: [{ message: 'Invalid form' }] };
      },
    });

    @Controller('/')
    class TestController {
      @Post('/form')
      form(data = validated(formSchema, 'form')) {
        return data;
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const formData = new FormData();
    formData.append('name', 'Ada');
    const res = await readyApp.http.fetch(
      new Request('http://localhost/form', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada' });
  });

  it('returns VALIDATION_FAILED response when validation fails', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = validated(userSchema)) {
        return data;
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; issues: unknown[] };
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('throws a clear error for async Standard Schema validation', async () => {
    const asyncSchema = createStandardSchema<{ ok: true }>({
      validate: async () => ({ value: { ok: true } }),
    });

    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = validated(asyncSchema)) {
        return data;
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ ok: true }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(500);
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('validated() does not support async validation schemas.');
  });

  it('infers the Standard Schema output type and preserves marker target', () => {
    const assertValidatedTypes = () => {
      const value = validated(userSchema);
      const formValue = validated(userSchema, 'form');

      expectTypeOf(value).toEqualTypeOf<ValidatedMarker<{ name: string; age: number }, 'json'>>();
      expectTypeOf(formValue).toEqualTypeOf<
        ValidatedMarker<{ name: string; age: number }, 'form'>
      >();
    };

    void assertValidatedTypes;
  });
});
