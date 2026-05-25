import type { LogEntry } from '../logger.types';

export type LoggerFormatter = {
  format: (entry: LogEntry) => string;
};
