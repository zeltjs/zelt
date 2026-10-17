import { Config } from '../config';

@Config
export class HttpRequestConfig {
  async prepare(request: Request): Promise<Request> {
    return request;
  }

  create(input: string | Request, init?: RequestInit): Request {
    return typeof input === 'string'
      ? new Request(new URL(input, 'http://localhost'), init)
      : input;
  }
}
