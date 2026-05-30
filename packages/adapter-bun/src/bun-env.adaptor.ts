import { Config, EnvAdaptor } from '@zeltjs/core';

@Config
export class BunEnvAdaptor extends EnvAdaptor {
  override get(key: string): string | undefined {
    return Bun.env[key];
  }
}
