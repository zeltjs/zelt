import { Config } from '../../config';

@Config
export class EnvConfig {
  static readonly Token = EnvConfig;

  get(key: string): string | undefined {
    return process.env[key];
  }
}
