import { Config } from '../config';

@Config
export class CorsConfig {
  static readonly Token = CorsConfig;

  get origin(): string | string[] {
    return [];
  }

  get allowMethods(): string[] {
    return ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'];
  }

  get allowHeaders(): string[] {
    return [];
  }

  get exposeHeaders(): string[] {
    return [];
  }

  get maxAge(): number | undefined {
    return undefined;
  }

  get credentials(): boolean {
    return false;
  }
}
