import { Config } from '../../config';

@Config
export class PrettyFormatterConfig {
  static readonly Token = PrettyFormatterConfig;

  get useColors(): boolean {
    return false;
  }
}
