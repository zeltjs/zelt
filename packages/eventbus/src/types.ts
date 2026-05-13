// biome-ignore lint/suspicious/noEmptyInterface: declaration merging requires interface
export interface EventBusSchema {}

export interface EventBusAdaptor {
  emit<K extends keyof EventBusSchema>(event: K, data: EventBusSchema[K]): Promise<void>;
  on<K extends keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void;
  once<K extends keyof EventBusSchema>(
    event: K,
    handler: (data: EventBusSchema[K]) => void,
  ): () => void;
}
