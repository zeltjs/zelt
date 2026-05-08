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
    const token = findRootConfigToken(configClass);
    if (token && token !== configClass) {
      tokenMap.set(token, configClass);
    }
  }
};

export const getTestDefaults = (): TestDefaults => ({ tokenMap });
