import { Config } from '@zeltjs/core';

import { AppConfig } from './app-config';

@Config
export class TestAppConfig extends AppConfig {
  override get appName(): string {
    return 'override-name';
  }

  override get version(): number {
    return 999;
  }
}
