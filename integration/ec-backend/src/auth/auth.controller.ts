import { Controller, Get, Post, inject } from '@zeltjs/core';
import { UseMiddleware } from '@zeltjs/core';
import { JwtMiddleware } from '@zeltjs/auth-jwt';
import { RateLimit } from '@zeltjs/rate-limit';
import { HTTPException } from 'hono/http-exception';
import { validated } from '@zeltjs/validator-valibot';

import { AuthService } from './auth.service';
import { requireUser } from './current-user.lib';
import { RegisterSchema, LoginSchema } from './auth.schema';

@Controller('/api/auth')
export class AuthController {
  constructor(private readonly authService = inject(AuthService)) {}

  @RateLimit({ limit: 3, windowSec: 60, key: 'auth:register' })
  @Post('/register')
  async register(data = validated(RegisterSchema)) {
    const user = await this.authService.register(data);
    return user;
  }

  @RateLimit({ limit: 5, windowSec: 60, key: 'auth:login' })
  @Post('/login')
  async login(data = validated(LoginSchema)) {
    const result = await this.authService.login(data.email, data.password);
    return result;
  }

  @UseMiddleware(JwtMiddleware)
  @Get('/me')
  async me() {
    const user = requireUser();
    const profile = await this.authService.getProfile(user.id);
    if (!profile) {
      throw new HTTPException(404, { message: 'User not found' });
    }
    return profile;
  }
}
