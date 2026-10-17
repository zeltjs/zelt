import { CloudflareBindings } from '@zeltjs/adapter-cloudflare-workers';
import { Injectable, inject } from '@zeltjs/core';

import type { UrlRecord } from './types';

@Injectable()
export class KVService {
  constructor(private readonly bindings = inject(CloudflareBindings)) {}

  async get(code: string): Promise<UrlRecord | null> {
    return this.bindings.get('URLS').get<UrlRecord>(`url:${code}`, 'json');
  }

  async set(code: string, record: UrlRecord): Promise<void> {
    await this.bindings.get('URLS').put(`url:${code}`, JSON.stringify(record));
  }

  async incrementHits(code: string): Promise<void> {
    const record = await this.get(code);
    if (record) {
      record.hits += 1;
      await this.set(code, record);
    }
  }
}
