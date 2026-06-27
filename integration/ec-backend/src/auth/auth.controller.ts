import { JwtMiddleware } from '@zeltjs/auth-jwt';
import { Controller, Get, inject, Post, UseMiddleware } from '@zeltjs/core';
import { RateLimit } from '@zeltjs/rate-limit';
import { request } from '@zeltjs/validator-valibot';
import { HTTPException } from 'hono/http-exception';
import { LoginSchema, RegisterSchema } from './auth.schema';
import { AuthService } from './auth.service';
import { requireUser } from './current-user.lib';

@Controller('/api/auth')
export class AuthController {
  constructor(private readonly authService = inject(AuthService)) {}

  @RateLimit({ limit: 3, windowSec: 60, key: 'auth:register' })
  @Post('/register')
  async register(req = request(RegisterSchema)) {
    const data = await req.body();
    const user = await this.authService.register(data);
    return user;
  }

  @RateLimit({ limit: 5, windowSec: 60, key: 'auth:login' })
  @Post('/login')
  async login(req = request(LoginSchema)) {
    const data = await req.body();
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
