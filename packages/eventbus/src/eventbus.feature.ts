import type { ConfiguredFeature } from '@zeltjs/core';

import type { EventBusAdaptor, EventBusSchema } from './eventbus.types';

type EventBusHandlerClass = new (...args: never[]) => object;

type EventBusOptions = {
  readonly adaptor: new (...args: never[]) => EventBusAdaptor;
  readonly handlers?: readonly EventBusHandlerClass[];
};

export type EventBusCapabilities = {
  readonly emit: <K extends string & keyof EventBusSchema>(
    event: K,
    data: EventBusSchema[K],
  ) => Promise<void>;
  readonly on: <K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ) => () => void;
  readonly once: <K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ) => () => void;
};

export const eventbus = (
  opts: EventBusOptions,
): ConfiguredFeature<'eventbus', EventBusCapabilities> => ({
  key: 'eventbus',
  featureClasses: () => [opts.adaptor, ...(opts.handlers ?? [])],
  staticCapabilities: () => ({}),
  createCapabilities: async (runtime) => {
    for (const handler of opts.handlers ?? []) {
      await runtime.get(handler);
    }

    const adaptor = await runtime.get(opts.adaptor);
    return {
      emit: (event, data) => adaptor.emit(event, data),
      on: (event, handler) => adaptor.on(event, handler),
      once: (event, handler) => adaptor.once(event, handler),
    };
  },
});
