import { Injectable, inject } from '@zeltjs/core';

import { AppConfig } from './app-config';

@Injectable()
export class ConfigConsumerService {
  constructor(public readonly config = inject(AppConfig)) {}

  describe(): string {
    return `${this.config.appName}@${this.config.version}`;
  }
}
