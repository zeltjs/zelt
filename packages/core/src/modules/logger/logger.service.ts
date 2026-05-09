import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';

import { getLogContext } from './logger.context.lib';
import { LoggerConfig } from './logger.config';
import { LOG_LEVEL_PRIORITY, type LogContext, type LogEntry, type LogLevel } from './logger.lib';

@Injectable()
export class Logger {
  constructor(
    private config = injectConfig(LoggerConfig),
    private bindings: LogContext = {},
  ) {}

  debug(msg: string, ctx: LogContext = {}): void {
    this.log('debug', msg, ctx);
  }

  info(msg: string, ctx: LogContext = {}): void {
    this.log('info', msg, ctx);
  }

  warn(msg: string, ctx: LogContext = {}): void {
    this.log('warn', msg, ctx);
  }

  error(msg: string, ctx: LogContext = {}): void {
    this.log('error', msg, ctx);
  }

  child(bindings: LogContext): Logger {
    const merged = { ...this.bindings, ...bindings };
    return new Logger(this.config, merged);
  }

  private log(level: LogLevel, msg: string, ctx: LogContext): void {
    const configLevel = this.config.level;
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[configLevel]) {
      return;
    }

    const globalContext = getLogContext();
    const entry: LogEntry = {
      level,
      message: msg,
      timestamp: new Date().toISOString(),
      context: { ...globalContext, ...this.bindings, ...ctx },
    };

    for (const { transport, formatter } of this.config.transports) {
      const formatted = formatter.format(entry);
      transport.write(formatted);
    }
  }
}
