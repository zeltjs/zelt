import type { InjectionToken } from '@needle-di/core';

type TokenKey = new (...args: never[]) => unknown;

export class UnsafeInjectionTokenWeakMap {
  private readonly map = new WeakMap<TokenKey, InjectionToken<unknown>>();

  get<T>(key: TokenKey): InjectionToken<T> | undefined {
    const token = this.map.get(key);
    return token as InjectionToken<T> | undefined;
  }

  set<T>(key: TokenKey, token: InjectionToken<T>): void {
    this.map.set(key, token as InjectionToken<unknown>);
  }
}
