// biome-ignore lint/suspicious/noEmptyInterface: declaration merging requires interface
export interface EventBusSchema extends Record<string, unknown> {}

export interface EventBusAdaptor {
  emit<K extends string & keyof EventBusSchema>(event: K, data: EventBusSchema[K]): Promise<void>;
  on<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void;
  once<K extends string & keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void;
}
