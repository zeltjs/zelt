import type { ValidatedMarker, ValidationTarget } from '@zeltjs/core';
import { body } from '@zeltjs/core';
import type { GenericSchema, InferOutput } from 'valibot';
import { safeParse } from 'valibot';

import { ValidationFailedException } from './validated.exceptions';

/** @throws {ValidationFailedException | ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<InferOutput<Schema>, 'json'>;
/** @throws {ValidationFailedException | ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<InferOutput<Schema>, 'form'>;
/** @throws {ValidationFailedException | ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: ValidationTarget = 'json',
): InferOutput<Schema> {
  const raw = target === 'form' ? body('form') : body('json');

  const result = safeParse(schema, raw);
  if (!result.success) {
    throw new ValidationFailedException({ issues: result.issues });
  }
  return result.output;
}
