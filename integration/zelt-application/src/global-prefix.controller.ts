import { Controller, Get, Post, pathParam } from '@zeltjs/core';

@Controller('/api/v1/health')
export class HealthController {
  @Get('/')
  health() {
    return { status: 'up' };
  }
}

@Controller('/api/v1/users')
export class UsersController {
  @Get('/')
  list() {
    return { users: [] };
  }

  @Post('/')
  create() {
    return { created: true };
  }

  @Get('/:id')
  getById(id = pathParam('id')) {
    return { id };
  }
}

@Controller('/api/:tenantId/items')
export class TenantItemsController {
  @Get('/')
  list(tenantId = pathParam('tenantId')) {
    return { tenantId };
  }
}
