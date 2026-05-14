import type {
  ExtractPathParams,
  ExtractRequestBody,
  ExtractResponse,
  ExtractValidationErrors,
} from './extract';

export type Route<M extends string, P extends string, H extends (...args: never[]) => unknown> = {
  readonly method: M;
  readonly path: P;
  readonly params: ExtractPathParams<P>;
  readonly body: ExtractRequestBody<H>;
  readonly response: ExtractResponse<H> | ExtractValidationErrors<H>;
};
