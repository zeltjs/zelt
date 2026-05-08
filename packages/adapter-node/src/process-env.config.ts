import { Config, EnvConfig } from '@zeltjs/core';

@Config
export class ProcessEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
