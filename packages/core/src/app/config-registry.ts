import { injectable } from '@needle-di/core';

import type { ConfigClass } from '../built-in-service/config';

@injectable()
export class ConfigRegistry {
  private readonly defaults: ConfigClass<object>[] = [];
  private readonly overrides: ConfigClass<object>[] = [];

  addFallbackConfig(config: ConfigClass<object>): void {
    this.defaults.push(config);
  }

  overrideConfig(config: ConfigClass<object>): void {
    this.overrides.push(config);
  }

  getDefaults(): readonly ConfigClass<object>[] {
    return this.defaults;
  }

  getOverrides(): readonly ConfigClass<object>[] {
    return this.overrides;
  }
}
