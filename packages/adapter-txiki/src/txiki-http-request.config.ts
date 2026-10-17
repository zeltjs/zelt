import { Config, HttpRequestConfig } from '@zeltjs/core';
import { prepareTxikiRequest } from './prepare-request.lib';

@Config
export class TxikiHttpRequestConfig extends HttpRequestConfig {
  override prepare(request: Request): Promise<Request> {
    return prepareTxikiRequest(request);
  }

  override create(input: string | Request, init?: RequestInit): Request {
    if (typeof input === 'string') return new Request(new URL(input, 'http://localhost'), init);
    if (init === undefined) return input;
    const options: RequestInit & { duplex: 'half' } = { ...init, duplex: 'half' };
    return new Request(input, options);
  }
}
