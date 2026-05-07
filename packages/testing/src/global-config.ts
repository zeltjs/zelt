import { findConfigToken } from '@zeltjs/core';

type AnyConstructor = new (...args: never[]) => unknown;

type TestDefaults = {
  readonly tokenMap: ReadonlyMap<AnyConstructor, AnyConstructor>;
};

type ConfigureOptions = {
  readonly configs: readonly AnyConstructor[];
};

const tokenMap = new Map<AnyConstructor, AnyConstructor>();

export const configureTestDefaults = (options: ConfigureOptions): void => {
  for (const configClass of options.configs) {
    const token = findConfigToken(configClass);
    if (token) {
      tokenMap.set(token, configClass);
    }
  }
};

export const getTestDefaults = (): TestDefaults => ({ tokenMap });
