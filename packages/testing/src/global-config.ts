import { findRootConfigToken, type ConfigClass } from '@zeltjs/core';

type AnyConfigClass = ConfigClass<object>;

type TestDefaults = {
  readonly tokenMap: ReadonlyMap<AnyConfigClass, AnyConfigClass>;
};

type ConfigureOptions = {
  readonly configs: readonly AnyConfigClass[];
};

const tokenMap = new Map<AnyConfigClass, AnyConfigClass>();

export const configureTestDefaults = (options: ConfigureOptions): void => {
  for (const configClass of options.configs) {
    const rootToken = findRootConfigToken(configClass);
    if (rootToken) {
      tokenMap.set(rootToken, configClass);
    }
  }
};

export const getTestDefaults = (): TestDefaults => ({ tokenMap });
