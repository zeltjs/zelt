import type { FeatureName, HttpFetchTarget } from '@zeltjs/core';
import { Feature } from '@zeltjs/core';
import type { LambdaHandlerV1, LambdaHandlerV2 } from './lambda-handler.lib';
import { createHandlerV1, createHandlerV2 } from './lambda-handler.lib';

export type LambdaHandlerOptions = {
  readonly payloadFormat: '1.0' | '2.0';
};

function createLambdaHandler(
  http: HttpFetchTarget,
  options: { payloadFormat: '1.0' },
): LambdaHandlerV1;
function createLambdaHandler(
  http: HttpFetchTarget,
  options?: { payloadFormat: '2.0' },
): LambdaHandlerV2;
function createLambdaHandler(
  http: HttpFetchTarget,
  options: LambdaHandlerOptions,
): LambdaHandlerV1 | LambdaHandlerV2;
function createLambdaHandler(
  http: HttpFetchTarget,
  options: LambdaHandlerOptions = { payloadFormat: '2.0' },
): LambdaHandlerV1 | LambdaHandlerV2 {
  const fetch = (request: Request): Promise<Response> => http.fetch(request);
  return options.payloadFormat === '1.0' ? createHandlerV1(fetch) : createHandlerV2(fetch);
}

export type LambdaHandlerCapabilities = {
  readonly create: typeof createLambdaHandler;
};

export class LambdaHandlerFeature<TName extends string = 'lambdaHandler'> extends Feature<
  TName,
  LambdaHandlerCapabilities
> {
  static readonly defaultKey = 'lambdaHandler';

  constructor(readonly key: TName) {
    super();
  }

  readonly featureClasses = () => [];
  readonly blueprint = () => ({});
  readonly realize = (): LambdaHandlerCapabilities => ({ create: createLambdaHandler });
}

export function lambdaHandler(): LambdaHandlerFeature<'lambdaHandler'>;
export function lambdaHandler<const TName extends string>(options: {
  readonly name: TName & FeatureName<TName>;
}): LambdaHandlerFeature<TName>;
export function lambdaHandler(options?: { readonly name: string }): LambdaHandlerFeature<string> {
  return new LambdaHandlerFeature(options?.name ?? 'lambdaHandler');
}
