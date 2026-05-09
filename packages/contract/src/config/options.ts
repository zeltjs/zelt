import type { SchemaAdapter } from '../types/schema-adapter';

export type GenerateClientOptions = {
  readonly controllers: readonly string[];
  readonly dist: string;
  readonly watch?: boolean;
  readonly tsconfig?: string;
  readonly requestValidator?: SchemaAdapter;
};

export const defineConfig = <T extends GenerateClientOptions>(config: T): T => config;
