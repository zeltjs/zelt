import { Config } from '../../config';

@Config
export class EnvSource {
  get(_key: string): string | undefined {
    return undefined;
  }
}
