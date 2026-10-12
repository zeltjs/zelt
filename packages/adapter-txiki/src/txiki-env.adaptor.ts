import { Config, EnvAdaptor } from '@zeltjs/core';

@Config
export class TxikiEnvAdaptor extends EnvAdaptor {
  override get(key: string): string | undefined {
    return tjs.env[key];
  }
}
