import { HTTPException } from 'hono/http-exception';
import { safeParse, type GenericSchema, type InferOutput } from 'valibot';

import { getEntryContext } from '../internal/entry-context';

export type ValidationTarget = 'json' | 'form';

declare const __zeltValidatedBrand: unique symbol;
declare const __zeltValidatedType: unique symbol;
declare const __zeltValidatedTarget: unique symbol;

export type ValidatedMarker<T, Target extends ValidationTarget = 'json'> = T & {
  [__zeltValidatedBrand]: true;
  [__zeltValidatedType]: T;
  [__zeltValidatedTarget]: Target;
};

export type ExtractValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedType, infer T> ? T : never;

export type ExtractValidationTarget<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedTarget, infer T extends ValidationTarget>
    ? T
    : 'json';

export type IsValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedBrand, true> ? true : false;

export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<InferOutput<Schema>, 'json'>;
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<InferOutput<Schema>, 'form'>;
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: ValidationTarget = 'json',
): InferOutput<Schema> {
  const ctx = getEntryContext();
  const body = target === 'json' ? ctx.input.jsonBody : ctx.input.formBody;
  const result = safeParse(schema, body);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json({ code: 'VALIDATION_FAILED', issues: result.issues }, { status: 400 }),
    });
  }
  return result.output;
}
