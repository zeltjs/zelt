import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';
import { LoggerConfig } from './config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

@Injectable()
export class Logger {
  constructor(private config = injectConfig(LoggerConfig)) {}

  debug(msg: string): void {
    this.log('debug', msg);
  }

  info(msg: string): void {
    this.log('info', msg);
  }

  warn(msg: string): void {
    this.log('warn', msg);
  }

  error(msg: string): void {
    this.log('error', msg);
  }

  private log(level: LogLevel, msg: string): void {
    const configLevel = this.config.level;
    if (LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(configLevel)) {
      console.log(`[${level.toUpperCase()}] ${msg}`);
    }
  }
}
