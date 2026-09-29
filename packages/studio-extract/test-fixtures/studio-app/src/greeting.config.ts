import { Config } from '@zeltjs/core';

@Config
export class GreetingConfig {
  get prefix(): string {
    return 'hello';
  }
}
