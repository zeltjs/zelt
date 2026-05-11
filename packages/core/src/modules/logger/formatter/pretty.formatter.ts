import { injectConfig } from '../../../config';
import { Injectable } from '../../../di/injectable';
import type { LogEntry } from '../index';
import { safeStringify } from '../index';

import type { LoggerFormatter } from './formatter.types';
import { PrettyFormatterConfig } from './pretty.formatter.config';
import { COLORS, RESET } from './pretty.formatter.lib';

@Injectable()
export class PrettyFormatter implements LoggerFormatter {
  constructor(private config = injectConfig(PrettyFormatterConfig)) {}

  format(entry: LogEntry): string {
    const { level, message, timestamp, context } = entry;
    const time = timestamp.slice(11, 19);
    const hasContext = Object.keys(context).length > 0;
    const contextStr = hasContext ? ` ${safeStringify(context)}` : '';

    if (this.config.useColors) {
      const color = COLORS[level];
      const levelTag = `${color}${level.toUpperCase().padEnd(5)}${RESET}`;
      return `${time} ${levelTag} ${message}${contextStr}`;
    }

    return `${time} ${level.toUpperCase().padEnd(5)} ${message}${contextStr}`;
  }
}
