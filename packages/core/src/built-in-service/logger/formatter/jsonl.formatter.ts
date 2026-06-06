import { Injectable } from '../../../kernel';
import type { LogEntry } from '../logger.types';
import type { LoggerFormatter } from './formatter.types';
import { safeStringify } from './safe-stringify.lib';

@Injectable()
export class JsonlFormatter implements LoggerFormatter {
  format(entry: LogEntry): string {
    const { context, ...rest } = entry;
    return safeStringify({ ...context, ...rest });
  }
}
