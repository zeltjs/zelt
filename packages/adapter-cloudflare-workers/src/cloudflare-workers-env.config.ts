import { env } from 'cloudflare:workers';
import { Config, EnvConfig } from '@zeltjs/core';

@Config
export class CloudflareWorkersEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    const value: unknown = (env as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
}
