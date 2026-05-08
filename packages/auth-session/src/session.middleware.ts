import { getCookie } from 'hono/cookie';
import { Middleware, injectConfig } from '@zeltjs/core';
import type { RequestContext, Next } from '@zeltjs/core';

import { SessionConfig } from './session.config';
import { runWithSessionContext } from './session.context.lib';
import { generateSessionId, signSessionId, verifyAndExtractSessionId } from './session.crypto.lib';
import type { StoredSession } from './session.types';

@Middleware
export class SessionMiddleware {
  constructor(private readonly config = injectConfig(SessionConfig)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const { sessionId, session, isNew } = await this.loadOrCreateSession(c);

    const context = {
      sessionId,
      session,
      isNew,
      isDestroyed: false,
      isDirty: false,
    };

    await runWithSessionContext(context, () => next());

    const cookieHeader = await this.getCookieHeader(sessionId, context);
    if (cookieHeader) {
      c.res.headers.append('Set-Cookie', cookieHeader);
    }

    return undefined;
  }

  private async getCookieHeader(
    sessionId: string,
    ctx: {
      session: StoredSession;
      isDestroyed: boolean;
      isDirty: boolean;
      isNew: boolean;
    },
  ): Promise<string | null> {
    if (ctx.isDestroyed) {
      await this.config.store.del(sessionId);
      return this.buildDeleteCookieHeader();
    }

    if (ctx.isDirty || ctx.isNew) {
      ctx.session.meta.expiresAt = Date.now() + this.config.ttlSec * 1000;
      await this.config.store.set(sessionId, ctx.session, { ttlSec: this.config.ttlSec });
      const signedId = signSessionId(sessionId, this.config.secret);
      return this.buildSetCookieHeader(signedId);
    }

    return null;
  }

  private async loadOrCreateSession(c: RequestContext): Promise<{
    sessionId: string;
    session: StoredSession;
    isNew: boolean;
  }> {
    const signedId = getCookie(c, this.config.cookieName);

    if (signedId) {
      const sessionId = verifyAndExtractSessionId(signedId, this.config.secret);
      if (sessionId) {
        const stored = await this.config.store.get<StoredSession>(sessionId);
        if (stored && stored.meta.expiresAt > Date.now()) {
          return { sessionId, session: stored, isNew: false };
        }
      }
    }

    return this.createNewSession();
  }

  private createNewSession(): { sessionId: string; session: StoredSession; isNew: boolean } {
    const sessionId = generateSessionId();
    const now = Date.now();
    const session: StoredSession = {
      data: {},
      meta: {
        createdAt: now,
        expiresAt: now + this.config.ttlSec * 1000,
      },
    };
    return { sessionId, session, isNew: true };
  }

  private buildSetCookieHeader(value: string): string {
    const opts = this.config.cookieOptions;
    const parts = [
      `${this.config.cookieName}=${value}`,
      `Max-Age=${this.config.ttlSec}`,
      `Path=${opts.path}`,
    ];
    if (opts.httpOnly) parts.push('HttpOnly');
    if (opts.secure) parts.push('Secure');
    parts.push(`SameSite=${opts.sameSite}`);
    return parts.join('; ');
  }

  private buildDeleteCookieHeader(): string {
    const opts = this.config.cookieOptions;
    return `${this.config.cookieName}=; Max-Age=0; Path=${opts.path}`;
  }
}
