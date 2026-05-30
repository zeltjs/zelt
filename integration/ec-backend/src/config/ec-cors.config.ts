import { Config, CorsConfig } from '@zeltjs/core';

@Config
export class EcCorsConfig extends CorsConfig {
  override readonly origin = ['http://localhost:3000'];
  override readonly credentials = true;
}
