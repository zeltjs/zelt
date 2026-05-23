import type { ValidatedMarker, ValidationTarget } from '@zeltjs/core';
import { getEntryContext, ZeltBodyTypeMismatchError } from '@zeltjs/core/runtime';
import { HTTPException } from 'hono/http-exception';
import type { GenericSchema, InferOutput } from 'valibot';
import { safeParse } from 'valibot';

/** @throws {HTTPException | ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<InferOutput<Schema>, 'json'>;
/** @throws {HTTPException | ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<InferOutput<Schema>, 'form'>;
/** @throws {HTTPException | ZeltContextNotAvailableError | ZeltBodyTypeMismatchError} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: ValidationTarget = 'json',
): InferOutput<Schema> {
  const { body } = getEntryContext().input;

  if (body.type !== target) {
    throw new ZeltBodyTypeMismatchError({
      expected: target,
      actual: body.type,
    });
  }

  const result = safeParse(schema, body.val);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json({ code: 'VALIDATION_FAILED', issues: result.issues }, { status: 400 }),
    });
  }
  return result.output;
}
