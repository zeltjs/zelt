import { Config, EnvAdaptor } from '@zeltjs/core';

@Config
export class ProcessEnvAdaptor extends EnvAdaptor {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
