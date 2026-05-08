import { Config } from '../../config';

@Config
export class EnvConfig {
  get(_key: string): string | undefined {
    return undefined;
  }
}
