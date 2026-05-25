import { Controller, Get, inject } from '@zeltjs/core';

import { ConfigConsumerService } from './config-consumer.service';

@Controller('/config')
export class ConfigController {
  constructor(private consumer = inject(ConfigConsumerService)) {}

  @Get('/')
  index() {
    return { description: this.consumer.describe() };
  }
}
