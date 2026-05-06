import type { Context } from 'hono';
import { Injectable } from '@zeltjs/core';

import type { Env } from '../env';

import type { UrlRecord } from './types';

type RequestContext = Context<Env>;

const getKV = (c: RequestContext): KVNamespace => c.env.URLS;

@Injectable()
export class KVService {
  async get(c: RequestContext, code: string): Promise<UrlRecord | null> {
    const data = await getKV(c).get(`url:${code}`, 'json');
    return data as UrlRecord | null;
  }

  async set(c: RequestContext, code: string, record: UrlRecord): Promise<void> {
    await getKV(c).put(`url:${code}`, JSON.stringify(record));
  }

  async incrementHits(c: RequestContext, code: string): Promise<void> {
    const record = await this.get(c, code);
    if (record) {
      record.hits += 1;
      await this.set(c, code, record);
    }
  }
}
