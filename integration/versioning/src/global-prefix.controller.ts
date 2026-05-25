import { Controller, Get, response } from '@zeltjs/core';

// Mirrors NestJS `setGlobalPrefix('/api/v1')`: every regular route is mounted
// under the shared `/api/v1` prefix.
@Controller('/api/v1')
export class GlobalPrefixController {
  @Get('/users')
  users() {
    return response().text('Users under /api/v1');
  }

  @Get('/posts')
  posts() {
    return response().text('Posts under /api/v1');
  }
}

// Mirrors NestJS `setGlobalPrefix('/api/v1', { exclude: ['/api/v1/exclude-path'] })`:
// a route that visually lives under the prefix but is wired outside the
// prefixed controller so it can bypass prefix-scoped behaviour.
@Controller('/')
export class GlobalPrefixExcludeController {
  @Get('/api/v1/exclude-path')
  excluded() {
    return response().text('Excluded from prefix');
  }
}
