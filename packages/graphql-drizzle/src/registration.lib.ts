import type { HttpStaticCapabilities } from '@zeltjs/core';
import { getGraphqlControllerMetadata } from '@zeltjs/graphql/codegen';
import { generatedModelKey } from './render.lib';
import type { Model } from './schema.types';

const collectRegistrations = (
  http: Pick<HttpStaticCapabilities, 'getControllers'>,
): ReadonlyMap<string, number> => {
  const registrations = new Map<string, number>();
  for (const controller of new Set(http.getControllers())) {
    const endpoint = getGraphqlControllerMetadata(controller);
    if (!endpoint) continue;
    for (const resolver of endpoint.resolvers) {
      const identity: unknown = Reflect.get(resolver, generatedModelKey);
      if (typeof identity !== 'string') continue;
      registrations.set(identity, (registrations.get(identity) ?? 0) + 1);
    }
  }
  return registrations;
};

export const registrationError = (
  http: Pick<HttpStaticCapabilities, 'getControllers'>,
  models: readonly Model[],
  source: string,
): string | undefined => {
  const registrations = collectRegistrations(http);
  for (const model of models) {
    const count = registrations.get(`${source}#${model.name}`) ?? 0;
    if (count !== 1) {
      return `Model "${model.name}" requires exactly one resolver extending Generated${model.name}Resolver registered in graphql(); found ${count}.`;
    }
  }
  return undefined;
};
