import { Injectable, inject } from '@zeltjs/core';
import { decodeJwt, jwtVerify, SignJWT } from 'jose';
import { fromThrowable } from 'neverthrow';

import { JwtConfig } from './jwt.config';
import type { JwtPayload } from './jwt.types';

@Injectable()
export class JwtService {
  constructor(private config = inject(JwtConfig)) {}

  async sign(payload: Record<string, unknown>): Promise<string> {
    const secret = new TextEncoder().encode(this.config.secret);
    const expiresIn = this.parseExpiresIn(this.config.expiresIn);

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secret);

    return jwt;
  }

  async verify(token: string): Promise<JwtPayload> {
    const secret = new TextEncoder().encode(this.config.secret);
    const { payload } = await jwtVerify<JwtPayload>(token, secret);
    return payload;
  }

  decode(token: string): JwtPayload | null {
    const safeDecode = fromThrowable(decodeJwt<JwtPayload>);
    return safeDecode(token).unwrapOr(null);
  }

  private parseExpiresIn(expiresIn: string): string | number {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (match) {
      const value = parseInt(match[1] ?? '0', 10);
      const unit = match[2] ?? '';
      const unitMap: Record<string, string> = {
        s: 'seconds',
        m: 'minutes',
        h: 'hours',
        d: 'days',
      };
      return `${value} ${unitMap[unit]}`;
    }
    return expiresIn;
  }
}
