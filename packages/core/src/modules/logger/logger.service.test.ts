import { Container } from '@needle-di/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Config } from '../../config';

import { LoggerConfig } from './logger.config';
import { Logger } from './logger.service';

describe('Logger', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockReset();
  });

  it('logs info by default', () => {
    const container = new Container();
    const logger = container.get(Logger);

    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalledWith('[INFO] test message');
  });

  it('respects log level from config', () => {
    @Config
    class CustomConfig extends LoggerConfig {
      constructor(private _level: 'debug' | 'info' | 'warn' | 'error') {
        super();
      }
      override get level(): 'debug' | 'info' | 'warn' | 'error' {
        return this._level;
      }
    }

    const warnContainer = new Container();
    warnContainer.bind({ provide: CustomConfig, useFactory: () => new CustomConfig('warn') });
    warnContainer.bind({ provide: LoggerConfig, useExisting: CustomConfig });

    const warnLogger = warnContainer.get(Logger);
    warnLogger.info('should not log');
    expect(consoleSpy).not.toHaveBeenCalled();

    warnLogger.warn('should log');
    expect(consoleSpy).toHaveBeenCalledWith('[WARN] should log');

    consoleSpy.mockClear();

    const debugContainer = new Container();
    debugContainer.bind({ provide: CustomConfig, useFactory: () => new CustomConfig('debug') });
    debugContainer.bind({ provide: LoggerConfig, useExisting: CustomConfig });

    const debugLogger = debugContainer.get(Logger);
    debugLogger.debug('debug message');
    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG] debug message');
  });
});
