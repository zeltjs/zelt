import { env } from 'cloudflare:workers';
import { Injectable } from '@zeltjs/core';

@Injectable()
export class CloudflareBindingsService {
  get<K extends keyof typeof env>(key: K): (typeof env)[K] {
    return env[key];
  }
}
