import { Config, EnvConfig } from '@zeltjs/core';

/**
 * @deprecated Use `inject(Env)` instead. ProcessEnvSource is registered automatically by onNode().
 * Will be removed in next major version.
 * @see Env
 */
@Config
export class ProcessEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
