import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { JwtService } from '@zeltjs/auth-jwt';
import { Injectable, inject } from '@zeltjs/core';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { DrizzleService } from '../db/drizzle.service';
import { users } from '../db/schema';
import type { RegisterInput } from './auth.schema';

const scryptAsync = promisify(scrypt);

const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, 'hex'), derived);
};

@Injectable()
export class AuthService {
  constructor(
    private readonly drizzle = inject(DrizzleService),
    private readonly jwtService = inject(JwtService),
  ) {}

  async register(data: RegisterInput): Promise<{ id: number; email: string; name: string }> {
    const existing = this.drizzle.db.select().from(users).where(eq(users.email, data.email)).get();

    if (existing) {
      throw new HTTPException(409, { message: 'Email already exists' });
    }

    const passwordHash = await hashPassword(data.password);
    const user = this.drizzle.db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        name: data.name,
        createdAt: new Date(),
      })
      .returning()
      .get();

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(email: string, password: string): Promise<{ token: string }> {
    const user = this.drizzle.db.select().from(users).where(eq(users.email, email)).get();

    if (!user) {
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }

    const token = await this.jwtService.sign({
      sub: String(user.id),
      email: user.email,
      roles: [user.role],
    });

    return { token };
  }

  async getProfile(
    userId: number,
  ): Promise<{ id: number; email: string; name: string; role: string } | undefined> {
    const user = this.drizzle.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return undefined;
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
