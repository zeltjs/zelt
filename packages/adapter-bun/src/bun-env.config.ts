import { Config, EnvConfig } from '@zeltjs/core';

@Config
export class BunEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    return Bun.env[key];
  }
}
