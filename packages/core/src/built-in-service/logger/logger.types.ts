export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Readonly<Record<string, unknown>>;

export type LogEntry = {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly context: LogContext;
};
