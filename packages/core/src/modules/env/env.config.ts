import { Config } from '../../config';

@Config
export class EnvConfig {
  static readonly Token = EnvConfig;

  get envFilePath(): string[] {
    return ['.env'];
  }
}
