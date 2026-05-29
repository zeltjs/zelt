import { env } from 'cloudflare:workers';
import { Config, EnvAdaptor } from '@zeltjs/core';

@Config
export class CloudflareWorkersEnvAdaptor extends EnvAdaptor {
  override get(key: string): string | undefined {
    const value: unknown = Reflect.get(env, key);
    return typeof value === 'string' ? value : undefined;
  }
}
