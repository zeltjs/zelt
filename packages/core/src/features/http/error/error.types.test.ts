import { describe, expectTypeOf, it } from 'vitest';

import type {
  ErrorBody,
  InternalErrorBody,
  ValidationErrorBody,
  ValidationIssue,
} from './error.types';

describe('ValidationErrorBody', () => {
  it('type matches expected structure', () => {
    expectTypeOf<ValidationErrorBody>().toExtend<{
      code: 'VALIDATION_FAILED';
      readonly issues: readonly ValidationIssue[];
    }>();
  });

  it('issues can have optional path', () => {
    expectTypeOf<ValidationIssue['path']>().toEqualTypeOf<readonly unknown[] | undefined>();
  });
});

describe('ErrorBody', () => {
  it('can be ValidationErrorBody', () => {
    expectTypeOf<ValidationErrorBody>().toExtend<ErrorBody>();
  });

  it('can be InternalErrorBody', () => {
    expectTypeOf<InternalErrorBody>().toExtend<ErrorBody>();
  });
});
