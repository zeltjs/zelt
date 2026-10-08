import { Injectable } from '../kernel';
import type { ConfiguredFeature, FeatureClass } from './feature.types';

export type FeatureInjectionFailure =
  | 'not_registered'
  | 'default_not_defined'
  | 'not_ready'
  | 'disposed'
  | 'invalid_capabilities';

export class FeatureInjectionError extends Error {
  constructor(
    readonly reason: FeatureInjectionFailure,
    readonly featureKey: string,
  ) {
    super(`Cannot use feature '${featureKey}': ${reason}`);
    this.name = 'FeatureInjectionError';
  }
}

type FeatureSlot = { readonly handle: object; value?: object };

/** Runtime-local references exist before realization, but cannot be used until startup. */
@Injectable()
export class FeatureRegistryService {
  private readonly slots = new Map<ConfiguredFeature, FeatureSlot>();
  private readonly lifecycle: { state: 'pending' | 'ready' | 'disposed' } = { state: 'pending' };

  /** @throws {FeatureInjectionError} */
  prepare(features: readonly ConfiguredFeature[]): void {
    for (const feature of features) {
      /** @throws {FeatureInjectionError} */
      const target = (): object => {
        if (this.lifecycle.state === 'disposed')
          throw new FeatureInjectionError('disposed', feature.key);
        const value = this.slots.get(feature)?.value;
        if (this.lifecycle.state !== 'ready' || value === undefined) {
          throw new FeatureInjectionError('not_ready', feature.key);
        }
        return value;
      };
      const handle = new Proxy(
        {},
        {
          get: (_, key): unknown => {
            const value: unknown = Reflect.get(target(), key);
            if (typeof value !== 'function') return value;
            // Check the lifetime again when an extracted method is called.
            return (...args: unknown[]): unknown => Reflect.apply(value, target(), args);
          },
          has: (_, key) => Reflect.has(target(), key),
          ownKeys: () => Reflect.ownKeys(target()),
          getOwnPropertyDescriptor: (_, key) => {
            const descriptor = Reflect.getOwnPropertyDescriptor(target(), key);
            return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
          },
        },
      );
      this.slots.set(feature, { handle });
    }
  }

  /** @throws {FeatureInjectionError} */
  get(feature: ConfiguredFeature | FeatureClass, name?: string): object {
    const definition = typeof feature === 'function' ? this.findDefinition(feature, name) : feature;
    if (this.lifecycle.state === 'disposed')
      throw new FeatureInjectionError('disposed', definition.key);
    const slot = this.slots.get(definition);
    if (slot === undefined) throw new FeatureInjectionError('not_registered', definition.key);
    return slot.handle;
  }

  /** @throws {FeatureInjectionError} */
  private findDefinition(feature: FeatureClass, name?: string): ConfiguredFeature {
    const key = name ?? feature.defaultKey;
    if (key === undefined) throw new FeatureInjectionError('default_not_defined', feature.name);
    const definition = [...this.slots.keys()].find(
      (item) => item instanceof feature && item.key === key,
    );
    if (definition === undefined) throw new FeatureInjectionError('not_registered', key);
    return definition;
  }

  /** @throws {FeatureInjectionError} */
  publish(feature: ConfiguredFeature, value: object): void {
    const slot = this.slots.get(feature);
    if (slot === undefined) throw new FeatureInjectionError('not_registered', feature.key);
    slot.value = value;
  }

  activate(): void {
    this.lifecycle.state = 'ready';
  }

  dispose(): void {
    this.lifecycle.state = 'disposed';
  }
}
