import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  AsyncValidationUnsupportedException,
  ValidationFailedException,
} from '../validated.exceptions';
import type { ValidatedMarker, ValidationTarget } from '../validated.types';
import { body } from './body.lib';

const isThenable = (value: unknown): boolean => {
  if (value === null) {
    return false;
  }

  const valueType = typeof value;
  if (valueType !== 'object' && valueType !== 'function') {
    return false;
  }

  return typeof Reflect.get(Object(value), 'then') === 'function';
};

/** @throws {ValidationFailedException | AsyncValidationUnsupportedException | ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function validated<Schema extends StandardSchemaV1>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<StandardSchemaV1.InferOutput<Schema>, 'json'>;
/** @throws {ValidationFailedException | AsyncValidationUnsupportedException | ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function validated<Schema extends StandardSchemaV1>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<StandardSchemaV1.InferOutput<Schema>, 'form'>;
/** @throws {ValidationFailedException | AsyncValidationUnsupportedException | ZeltContextNotAvailableError | UnsupportedMediaTypeException} */
export function validated<Schema extends StandardSchemaV1>(
  schema: Schema,
  target: ValidationTarget = 'json',
): StandardSchemaV1.InferOutput<Schema> {
  const raw = target === 'form' ? body('form') : body('json');
  const result = schema['~standard'].validate(raw);

  if (result instanceof Promise || isThenable(result)) {
    throw new AsyncValidationUnsupportedException({});
  }

  if (result.issues) {
    throw new ValidationFailedException({ issues: result.issues });
  }

  return result.value;
}
