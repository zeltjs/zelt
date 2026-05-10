import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { runInEntryContext } from '@zeltjs/core/runtime';

import { validated } from './validated';

const Schema = v.object({ name: v.string(), age: v.number() });

describe('validated()', () => {
  it('returns parsed body when schema matches (json)', () => {
    const result = runInEntryContext(
      {
        input: { jsonBody: { name: 'Ada', age: 36 }, formBody: undefined, pathParams: {} },
        honoContext: {} as unknown as Context,
      },
      () => validated(Schema),
    );
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('returns parsed body when schema matches (form)', () => {
    const FormSchema = v.object({ name: v.string() });
    const result = runInEntryContext(
      {
        input: { jsonBody: undefined, formBody: { name: 'Ada' }, pathParams: {} },
        honoContext: {} as unknown as Context,
      },
      () => validated(FormSchema, 'form'),
    );
    expect(result).toEqual({ name: 'Ada' });
  });

  it('throws HTTPException with 400 when schema does not match', () => {
    expect(() =>
      runInEntryContext(
        {
          input: { jsonBody: { name: 'Ada' }, formBody: undefined, pathParams: {} },
          honoContext: {} as unknown as Context,
        },
        () => validated(Schema),
      ),
    ).toThrow(HTTPException);
  });

  it('HTTPException contains VALIDATION_FAILED response', async () => {
    expect.assertions(4);
    try {
      runInEntryContext(
        {
          input: { jsonBody: { name: 'Ada' }, formBody: undefined, pathParams: {} },
          honoContext: {} as unknown as Context,
        },
        () => validated(Schema),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      const httpErr = err as HTTPException;
      expect(httpErr.status).toBe(400);
      const res = httpErr.getResponse();
      const json = (await res.json()) as { code: string; issues: unknown[] };
      expect(json.code).toBe('VALIDATION_FAILED');
      expect(json.issues.length).toBeGreaterThan(0);
    }
  });
});
