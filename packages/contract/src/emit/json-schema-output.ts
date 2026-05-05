import { createGenerator, type Config } from 'ts-json-schema-generator';

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

// TypedResponse の body 型が単純 identifier の場合だけ named ref として扱う。
// generic / union / intersection は inline placeholder にフォールバック (MVP)。
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
): ResponseSchemaJson => {
  if (resp.kind === 'unresolvable') {
    throw new Error(
      'zelt/openapi: handler return type is unknown/any. Add an explicit return type annotation.',
    );
  }
  if (resp.kind === 'typed-response') return resolveTypedResponse(resp, options);
  if (resp.kind === 'ts-named') {
    return generateNamedSchema(resp.name, options.tsconfigPath, 200, 'application/json');
  }
  return {
    kind: 'inline',
    schema: { description: resp.typeText },
    status: 200,
    contentType: 'application/json',
  };
};
