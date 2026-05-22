import { Config, EnvSource } from '@zeltjs/core';

@Config
export class ProcessEnvSource extends EnvSource {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
