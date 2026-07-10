import type { ConfigClass } from '../built-in-service';
import { Injectable } from '../kernel';

@Injectable()
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
