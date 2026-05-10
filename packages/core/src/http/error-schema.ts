export type ValidationIssue = {
  readonly kind: string;
  readonly type: string;
  readonly message: string;
  readonly path?: readonly unknown[];
};

export type ValidationErrorBody = {
  code: 'VALIDATION_FAILED';
  readonly issues: readonly ValidationIssue[];
};

export type InternalErrorBody = {
  code: 'INTERNAL_ERROR';
  readonly message: string;
};

export type ErrorBody = ValidationErrorBody | InternalErrorBody;
