import { Controller, Get, Post, request } from '@zeltjs/core';

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
  getById(req = request()) {
    const id = req.pathParam('id');
    return { id };
  }
}

@Controller('/api/:tenantId/items')
export class TenantItemsController {
  @Get('/')
  list(req = request()) {
    const tenantId = req.pathParam('tenantId');
    return { tenantId };
  }
}
