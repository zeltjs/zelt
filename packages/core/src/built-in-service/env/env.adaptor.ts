import { Config } from '../config';

/**
 * @internal Platform adapters extend this class; end users should use inject(Env) instead.
 */
@Config
export class EnvAdaptor {
  get(_key: string): string | undefined {
    return undefined;
  }
}
