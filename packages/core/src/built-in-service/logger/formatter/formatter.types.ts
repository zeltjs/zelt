import type { LogEntry } from '../index';

export type LoggerFormatter = {
  format: (entry: LogEntry) => string;
};
