import { Controller, Get } from '@zeltjs/core';

@Controller('/health')
export class HealthController {
  @Get('/')
  get() {
    return {
      app: 'graphql-dogfooding-storefront',
      graphql: '/graphql',
      status: 'ok',
    };
  }
}
