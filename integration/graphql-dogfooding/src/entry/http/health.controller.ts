import { Controller, Get } from '@zeltjs/core';

@Controller('/health')
export class HealthController {
  @Get('/')
  get() {
    return {
      app: 'graphql-dogfooding-storefront',
      graphql: '/api/v1/graphql',
      status: 'ok',
    };
  }
}
