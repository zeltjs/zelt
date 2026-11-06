import type { CapturedContext, RequestAccessor } from '@zeltjs/core';
import { response } from '@zeltjs/core';
import { createHandler } from 'graphql-http';
import { match, P } from 'ts-pattern';
import type { GraphqlExecution } from './graphql-runtime.lib';

// graphql-http owns protocol decisions; this adapter only translates Zelt I/O.
/**
 * @throws {Error} from graphql-http.lib.ts:anonymous_L11
 */
const httpStatus = (status: number) =>
  match(status)
    .with(P.union(200, 400, 405, 406, 415, 500), (known) => known)
    .otherwise(() => {
      throw new Error(`Unsupported GraphQL HTTP response status: ${status}`);
    });

/** @throws {Error} from graphql-http.lib.ts:httpStatus */
const operationStatus = (
  status: number,
  contentType: string | undefined,
  requestError: boolean,
) => {
  if (
    requestError &&
    status === 200 &&
    contentType?.startsWith('application/graphql-response+json')
  ) {
    return 400;
  }
  return httpStatus(status);
};

/**
 * @throws {Error} from graphql-http.lib.ts:anonymous_L11
 * @throws {TypeError} from response.lib.ts:assertStatus
 */
export const handleGraphqlHttpRequest = async (options: {
  readonly request: RequestAccessor;
  readonly captured: CapturedContext;
  readonly execution: GraphqlExecution;
}) => {
  const { request, captured, execution } = options;
  let requestError = false;
  const handler = createHandler({
    schema: execution.schema,
    execute: async (args) => {
      const result = await execution.execute(args, captured);
      requestError = result.data === undefined && Boolean(result.errors?.length);
      return result;
    },
    validationRules: execution.validationRules,
  });
  const [body, init] = await handler({
    method: request.method(),
    url: request.url(),
    headers: { get: (name) => request.header(name) ?? null },
    body: () => request.bodyRaw(),
    raw: request,
    context: undefined,
  });
  let reply = response().status(
    operationStatus(init.status, init.headers?.['content-type'], requestError),
  );
  for (const [name, value] of Object.entries(init.headers ?? {})) {
    reply = reply.header(name, value);
  }
  return body === null ? reply.empty() : reply.body(body);
};
