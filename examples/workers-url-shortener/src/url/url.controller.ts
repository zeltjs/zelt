import type { Context } from 'hono';
import {
  Controller,
  Get,
  HTTPException,
  Post,
  inject,
  pathParam,
  requestContext,
  response,
  validated,
} from '@zeltjs/core';
import * as v from 'valibot';

import type { Env } from '../env';

import { KVService } from './kv.service';
import type { UrlRecord } from './types';

type RequestContext = Context<Env>;

const ShortenBody = v.object({
  url: v.pipe(v.string(), v.url()),
});

const generateCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

@Controller('/')
export class UrlController {
  constructor(private kv = inject(KVService)) {}

  @Post('/shorten')
  async shorten(
    body = validated(ShortenBody),
    res = response(),
    ctx = requestContext() as RequestContext,
  ) {
    const code = generateCode();
    const record: UrlRecord = {
      url: body.url,
      createdAt: Date.now(),
      hits: 0,
    };
    await this.kv.set(ctx, code, record);
    return res.json({ code, shortUrl: `/${code}` }, 201);
  }

  @Get('/stats/:code')
  async stats(code = pathParam('code'), ctx = requestContext() as RequestContext) {
    const record = await this.kv.get(ctx, code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    return { code, url: record.url, hits: record.hits, createdAt: record.createdAt };
  }

  @Get('/:code')
  async redirect(
    code = pathParam('code'),
    res = response(),
    ctx = requestContext() as RequestContext,
  ) {
    const record = await this.kv.get(ctx, code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    await this.kv.incrementHits(ctx, code);
    return res.redirect(record.url, 302);
  }
}
