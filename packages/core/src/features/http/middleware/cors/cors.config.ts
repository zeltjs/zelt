import { Config } from '../../../../built-in-service';

@Config
export class CorsConfig {
  readonly origin: string | string[] = [];

  readonly allowMethods: string[] = ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'];

  readonly allowHeaders: string[] = [];

  readonly exposeHeaders: string[] = [];

  readonly maxAge: number | undefined = undefined;

  readonly credentials: boolean = false;
}
