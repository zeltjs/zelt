import { inject } from '../../kernel/di';
import { Injectable } from '../../kernel/di';
import { LoggerConfig } from './logger.config';
import { getLogContext } from './logger.context.lib';
import { LOG_LEVEL_PRIORITY } from './logger.lib';
import type { LogContext, LogEntry, LogLevel } from './logger.types';

@Injectable()
export class LoggerService {
  constructor(
    private readonly config = inject(LoggerConfig),
    private readonly bindings: LogContext = {},
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

  child(bindings: LogContext): LoggerService {
    const merged = { ...this.bindings, ...bindings };
    return new LoggerService(this.config, merged);
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
