import type { HttpStaticCapabilities } from '@zeltjs/core';
import { getGraphqlControllerMetadata } from '@zeltjs/graphql/codegen';
import { generatedModelKey, modelIdentity, resolverClassName } from './generated-module.lib';
import type { Model } from './schema.types';

const collectRegistrations = (
  http: Pick<HttpStaticCapabilities, 'getControllers'>,
): ReadonlyMap<string, number> => {
  // One resolver class may serve several endpoints; it still extends the model only once.
  const resolvers = new Set(
    http
      .getControllers()
      .flatMap((controller) => getGraphqlControllerMetadata(controller)?.resolvers ?? []),
  );
  const registrations = new Map<string, number>();
  for (const resolver of resolvers) {
    const identity: unknown = Reflect.get(resolver, generatedModelKey);
    if (typeof identity !== 'string') continue;
    registrations.set(identity, (registrations.get(identity) ?? 0) + 1);
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
    const count = registrations.get(modelIdentity(source, model.name)) ?? 0;
    if (count !== 1) {
      return `Model "${model.name}" requires exactly one resolver extending ${resolverClassName(model.name)} registered in graphql(); found ${count}.`;
    }
  }
  return undefined;
};
