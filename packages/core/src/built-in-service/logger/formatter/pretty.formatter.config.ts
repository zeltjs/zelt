import { Config } from '../../config';

@Config
export class PrettyFormatterConfig {
  get useColors(): boolean {
    return false;
  }
}
