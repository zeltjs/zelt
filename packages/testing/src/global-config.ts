import type { ConfigClass } from '@zeltjs/core';

type AnyConfigClass = ConfigClass<object>;

type TestDefaults = {
  readonly configs: readonly AnyConfigClass[];
};

type ConfigureOptions = {
  readonly configs: readonly AnyConfigClass[];
};

const globalConfigs: AnyConfigClass[] = [];

export const configureTestDefaults = (options: ConfigureOptions): void => {
  globalConfigs.push(...options.configs);
};

export const getTestDefaults = (): TestDefaults => ({ configs: globalConfigs });
