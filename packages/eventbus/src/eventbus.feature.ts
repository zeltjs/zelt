import type { ServiceResolver } from '@zeltjs/core';
import { Feature } from '@zeltjs/core';

import type { EventBusAdaptor, EventBusSchema } from './eventbus.types';

type EventBusHandlerClass = new (...args: never[]) => object;

export type EventBusOptions<TName extends string = 'eventbus'> = {
  readonly name?: TName;
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
  ) => Promise<() => void>;
  readonly once: <K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ) => Promise<() => void>;
};

export class EventBusFeature<TName extends string = 'eventbus'> extends Feature<
  TName,
  EventBusCapabilities
> {
  static get defaultKey(): 'eventbus' {
    return 'eventbus';
  }

  constructor(
    private readonly opts: EventBusOptions<TName>,
    readonly key: TName,
  ) {
    super();
  }

  featureClasses = () => [this.opts.adaptor, ...(this.opts.handlers ?? [])];
  blueprint = () => ({});
  realize = async (resolver: ServiceResolver): Promise<EventBusCapabilities> => {
    // Construct dependencies before consumers so their startup hooks run first.
    const adaptor = await resolver.get(this.opts.adaptor);
    for (const handler of this.opts.handlers ?? []) {
      await resolver.get(handler);
    }
    return {
      emit: (event, data) => adaptor.emit(event, data),
      on: (event, handler) => adaptor.on(event, handler),
      once: (event, handler) => adaptor.once(event, handler),
    };
  };
}

export function eventbus(opts: Omit<EventBusOptions, 'name'>): EventBusFeature<'eventbus'>;
export function eventbus<const TName extends string>(
  opts: EventBusOptions<TName> & { readonly name: TName },
): EventBusFeature<TName>;
export function eventbus(opts: EventBusOptions<string>): EventBusFeature<string> {
  return new EventBusFeature(opts, opts.name ?? 'eventbus');
}
