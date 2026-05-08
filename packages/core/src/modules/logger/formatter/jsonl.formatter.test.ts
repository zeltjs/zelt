import { Container } from '@needle-di/core';
import { describe, it, expect } from 'vitest';

import type { LogEntry } from '../index';

import { JsonlFormatter } from './jsonl.formatter';

describe('JsonlFormatter', () => {
  it('standard fields take precedence over context', () => {
    const container = new Container();
    const formatter = container.get(JsonlFormatter);

    const entry: LogEntry = {
      level: 'info',
      message: 'test',
      timestamp: '2026-05-09T12:00:00.000Z',
      context: { level: 'MALICIOUS', message: 'OVERRIDE', extra: 'value' },
    };

    const result = formatter.format(entry);
    const parsed = JSON.parse(result);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.extra).toBe('value');
  });

  it('handles BigInt in context', () => {
    const container = new Container();
    const formatter = container.get(JsonlFormatter);

    const entry: LogEntry = {
      level: 'info',
      message: 'test',
      timestamp: '2026-05-09T12:00:00.000Z',
      context: { bigValue: BigInt(9007199254740991) },
    };

    const result = formatter.format(entry);
    const parsed = JSON.parse(result);

    expect(parsed.bigValue).toBe('9007199254740991');
  });

  it('handles circular references in context', () => {
    const container = new Container();
    const formatter = container.get(JsonlFormatter);

    const circular: Record<string, unknown> = { name: 'test' };
    circular['self'] = circular;

    const entry: LogEntry = {
      level: 'info',
      message: 'test',
      timestamp: '2026-05-09T12:00:00.000Z',
      context: circular,
    };

    expect(() => formatter.format(entry)).not.toThrow();
    const result = formatter.format(entry);
    expect(result).toContain('[Circular]');
  });
});
