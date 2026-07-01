import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Context, Env, Input } from 'hono';

import { runInContext } from '../../../../kernel';
import { setHonoContext } from '../index';
import { setPathParams } from './path-param.lib';

type TestEntryContext = {
  honoContext: Context<Env, string, Input>;
  pathParams?: Readonly<Record<string, string>>;
};

/** @throws {ZeltContextNotAvailableError} */
export const runInEntryContext = <T>(ctx: TestEntryContext, fn: () => T): T => {
  return runInContext(() => {
    setHonoContext(ctx.honoContext);
    setPathParams(ctx.pathParams ?? {});
    return fn();
  });
};

type SchemaConfig<Output> = {
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>;
};

export const createStandardSchema = <Output>({
  validate,
}: SchemaConfig<Output>): StandardSchemaV1<unknown, Output> => {
  const types: StandardSchemaV1.Types<unknown, Output> | undefined = undefined;
  return {
    '~standard': {
      version: 1,
      vendor: 'zelt-test',
      validate,
      types,
    },
  };
};
