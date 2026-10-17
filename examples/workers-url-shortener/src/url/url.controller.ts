import { Controller, Get, HTTPException, inject, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

import { KVService } from './kv.service';
import type { UrlRecord } from './types';

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
  async shorten(req = request(ShortenBody), res = response()) {
    const body = await req.body();
    const code = generateCode();
    const record: UrlRecord = {
      url: body.url,
      createdAt: Date.now(),
      hits: 0,
    };
    await this.kv.set(code, record);
    return res.json({ code, shortUrl: `/${code}` }, 201);
  }

  @Get('/stats/:code')
  async stats(req = request()) {
    const code = req.pathParam('code');
    const record = await this.kv.get(code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    return { code, url: record.url, hits: record.hits, createdAt: record.createdAt };
  }

  @Get('/:code')
  async redirect(req = request(), res = response()) {
    const code = req.pathParam('code');
    const record = await this.kv.get(code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    await this.kv.incrementHits(code);
    return res.redirect(record.url, 302);
  }
}
