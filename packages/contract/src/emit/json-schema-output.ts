// packages/contract/src/emit/json-schema-output.ts
import { createGenerator, type Config } from 'ts-json-schema-generator';
import { ok, err, type Result } from 'neverthrow';

import type { EmitError } from '../errors';
import type { ResponseTypeInfo } from '../analyzer/response-type';

export type ResponseSchemaJson =
  | {
      kind: 'ref';
      readonly name: string;
      readonly schema: unknown;
      readonly status: number;
      readonly contentType: string;
    }
  | {
      kind: 'inline';
      readonly schema: unknown;
      readonly status: number;
      readonly contentType: string;
    }
  | { kind: 'omit' };

type ResolveResponseOptions = {
  readonly tsconfigPath: string;
};

const formatToContentType = (format: string): string => {
  if (format === 'json') return 'application/json';
  if (format === 'text') return 'text/plain';
  return 'application/octet-stream';
};

const isSimpleIdentifier = (s: string): boolean => /^[A-Z][A-Za-z0-9_]*$/.test(s);

const generateNamedSchema = (
  typeName: string,
  tsconfigPath: string,
  status: number,
  contentType: string,
): ResponseSchemaJson => {
  const config: Config = {
    tsconfig: tsconfigPath,
    type: typeName,
    skipTypeCheck: true,
    topRef: false,
  };
  const generator = createGenerator(config);
  const schema: unknown = generator.createSchema(typeName);
  return { kind: 'ref', name: typeName, schema, status, contentType };
};

const resolveTypedResponse = (
  resp: Extract<ResponseTypeInfo, { kind: 'typed-response' }>,
  options: ResolveResponseOptions,
): ResponseSchemaJson => {
  const contentType = formatToContentType(resp.format);
  if (isSimpleIdentifier(resp.bodyTypeText)) {
    return generateNamedSchema(resp.bodyTypeText, options.tsconfigPath, resp.status, contentType);
  }
  return {
    kind: 'inline',
    schema: { description: resp.bodyTypeText },
    status: resp.status,
    contentType,
  };
};

export const resolveResponseSchema = (
  resp: ResponseTypeInfo,
  options: ResolveResponseOptions,
): Result<ResponseSchemaJson, EmitError> => {
  if (resp.kind === 'unresolvable') {
    return err({ type: 'UNRESOLVABLE_RESPONSE_TYPE' });
  }
  if (resp.kind === 'typed-response') {
    return ok(resolveTypedResponse(resp, options));
  }
  if (resp.kind === 'ts-named') {
    return ok(generateNamedSchema(resp.name, options.tsconfigPath, 200, 'application/json'));
  }
  return ok({
    kind: 'inline',
    schema: { description: resp.typeText },
    status: 200,
    contentType: 'application/json',
  });
};
