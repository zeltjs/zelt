import { Injectable } from '../../../kernel/di/injectable';
import type { LogEntry } from '../index';
import { safeStringify } from '../index';

import type { LoggerFormatter } from './formatter.types';

@Injectable()
export class JsonlFormatter implements LoggerFormatter {
  format(entry: LogEntry): string {
    const { context, ...rest } = entry;
    return safeStringify({ ...context, ...rest });
  }
}
