import { Config } from '../../config';

@Config
export class EnvConfig {
  get(_key: string): string | undefined {
    return undefined;
  }
}

@Config
export class ProcessEnvConfig extends EnvConfig {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
