import { Config } from '../../config';

/**
 * @deprecated Use `inject(Env)` instead. Will be removed in next major version.
 * @see Env
 */
@Config
export class EnvConfig {
  get(_key: string): string | undefined {
    return undefined;
  }
}
