import { Controller, Delete, Get, Post } from '@zeltjs/core';

import type { CreateUserRequest, UserResponse } from './types';

@Controller('/users')
export class UsersController {
  @Get('/')
  list(): UserResponse[] {
    return [];
  }

  @Get('/:id')
  show(): UserResponse {
    return { id: '1', name: 'Test', email: 'test@example.com', age: null, createdAt: '' };
  }

  @Post('/')
  create(body: CreateUserRequest): UserResponse {
    return { id: '1', name: body.name, email: body.email, age: body.age ?? null, createdAt: '' };
  }

  @Delete('/:id')
  destroy(): void {
    return;
  }
}
