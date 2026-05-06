import { Config } from '../../config';

export class EnvProvider {
  static readonly Token = EnvProvider;

  get(_key: string): string | undefined {
    throw new Error('EnvProvider.get() must be overridden by subclass');
  }
}

@Config
export class ProcessEnvConfig extends EnvProvider {
  override get(key: string): string | undefined {
    return process.env[key];
  }
}
