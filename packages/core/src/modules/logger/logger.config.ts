import { Config } from '../../config';

@Config
export class LoggerConfig {
  static readonly Token = LoggerConfig;

  get level(): 'debug' | 'info' | 'warn' | 'error' {
    return 'info';
  }
}
