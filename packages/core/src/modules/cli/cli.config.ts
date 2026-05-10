import { Config } from '../../config';

@Config
export class CliConfig {
  cwd(): string {
    throw new Error('CliConfig.cwd() not implemented');
  }

  argv(): readonly string[] {
    throw new Error('CliConfig.argv() not implemented');
  }

  exit(_code: number): never {
    throw new Error('CliConfig.exit() not implemented');
  }
}
