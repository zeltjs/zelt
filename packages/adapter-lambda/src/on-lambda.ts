import type { HttpCapabilities, ReadyApp, ReadyOptions } from '@zeltjs/core';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';

import { LambdaEnvAdaptor } from './lambda-env.adaptor';

export type LambdaAppOptions = {
  readonly warmup?: boolean;
};

export type LambdaHandlerV2 = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyResultV2>;

export type LambdaHandlerV1 = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

export type LambdaApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly handler: LambdaHandlerV2;
  readonly handlerV1: LambdaHandlerV1;
  readonly shutdown: () => Promise<void>;
};

const buildHeadersFromRecord = (
  headersRecord: Record<string, string | undefined> | undefined,
): Headers => {
  const headers = new Headers();
  if (headersRecord) {
    for (const [key, value] of Object.entries(headersRecord)) {
      if (value) headers.set(key, value);
    }
  }
  return headers;
};

const buildBodyFromEvent = (
  body: string | null | undefined,
  isBase64Encoded: boolean,
): BodyInit | null => {
  if (!body) return null;
  if (isBase64Encoded) {
    const buffer = Buffer.from(body, 'base64');
    return new Blob([buffer]);
  }
  return body;
};

const buildRequestBody = (method: string, body: BodyInit | null): BodyInit | null => {
  return method !== 'GET' && method !== 'HEAD' ? body : null;
};

const buildRequestFromEventV2 = (event: APIGatewayProxyEventV2): Request => {
  const headers = buildHeadersFromRecord(event.headers);

  const protocol = headers.get('x-forwarded-proto') ?? 'https';
  const host = event.requestContext.domainName;
  const path = event.rawPath;
  const queryString = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const url = `${protocol}://${host}${path}${queryString}`;

  const method = event.requestContext.http.method;
  const body = buildBodyFromEvent(event.body, event.isBase64Encoded);
  const requestBody = buildRequestBody(method, body);

  return new Request(url, {
    method,
    headers,
    body: requestBody,
  });
};

const buildQueryStringFromParams = (
  queryParams: Record<string, string | undefined> | null | undefined,
): string => {
  if (!queryParams) return '';
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined) {
      params[key] = value;
    }
  }
  return `?${new URLSearchParams(params).toString()}`;
};

const buildRequestFromEventV1 = (event: APIGatewayProxyEvent): Request => {
  const headers = buildHeadersFromRecord(event.headers);

  const protocol = headers.get('x-forwarded-proto') ?? 'https';
  const host = headers.get('host') ?? 'localhost';
  const path = event.path;

  const queryString = buildQueryStringFromParams(event.queryStringParameters);
  const url = `${protocol}://${host}${path}${queryString}`;

  const method = event.httpMethod;
  const body = buildBodyFromEvent(event.body, event.isBase64Encoded);
  const requestBody = buildRequestBody(method, body);

  return new Request(url, {
    method,
    headers,
    body: requestBody,
  });
};

const buildResultFromResponseV2 = async (response: Response): Promise<APIGatewayProxyResultV2> => {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isBinary =
    contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType === 'application/octet-stream';

  const body = isBinary
    ? Buffer.from(await response.arrayBuffer()).toString('base64')
    : await response.text();

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded: isBinary,
  };
};

const buildResultFromResponseV1 = async (response: Response): Promise<APIGatewayProxyResult> => {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isBinary =
    contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType === 'application/octet-stream';

  const body = isBinary
    ? Buffer.from(await response.arrayBuffer()).toString('base64')
    : await response.text();

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded: isBinary,
  };
};

const createHandlerV2 = (appFetch: (request: Request) => Promise<Response>): LambdaHandlerV2 => {
  return async (
    event: APIGatewayProxyEventV2,
    _context: Context,
  ): Promise<APIGatewayProxyResultV2> => {
    const request = buildRequestFromEventV2(event);
    const response = await appFetch(request);
    return buildResultFromResponseV2(response);
  };
};

const createHandlerV1 = (appFetch: (request: Request) => Promise<Response>): LambdaHandlerV1 => {
  return async (event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyResult> => {
    const request = buildRequestFromEventV1(event);
    const response = await appFetch(request);
    return buildResultFromResponseV1(response);
  };
};

type HttpReadyApp = ReadyApp & { readonly http: HttpCapabilities };

type HttpApp = {
  readonly ready: (options?: ReadyOptions) => Promise<HttpReadyApp>;
};

export const onLambda = async (
  app: HttpApp,
  options: LambdaAppOptions = {},
): Promise<LambdaApp> => {
  const readyApp = await app.ready({
    fallbackConfigs: [LambdaEnvAdaptor],
    warmup: options.warmup ?? false,
  });

  const handler = createHandlerV2(readyApp.http.fetch);
  const handlerV1 = createHandlerV1(readyApp.http.fetch);

  return {
    get: readyApp.get,
    handler,
    handlerV1,
    shutdown: readyApp.shutdown,
  };
};
