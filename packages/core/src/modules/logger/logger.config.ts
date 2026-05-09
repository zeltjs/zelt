import { Config } from '../../config';

@Config
export class LoggerConfig {
  get level(): 'debug' | 'info' | 'warn' | 'error' {
    return 'info';
  }
}
