import { Config } from '@zeltjs/core';

@Config
export class AppConfig {
  get appName(): string {
    return 'injector-test';
  }

  get version(): number {
    return 1;
  }
}
