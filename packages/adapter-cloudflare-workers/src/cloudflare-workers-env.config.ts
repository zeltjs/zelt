import { env } from 'cloudflare:workers';
import { Config, EnvConfig } from '@zeltjs/core';

@Config
export class CloudflareWorkersEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    const value: unknown = Reflect.get(env, key);
    return typeof value === 'string' ? value : undefined;
  }
}
