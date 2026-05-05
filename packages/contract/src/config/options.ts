export type GenerateClientOptions = {
  readonly controllers: readonly string[];
  readonly dist: string;
  readonly watch?: boolean;
  readonly tsconfig?: string;
};

export const defineConfig = <T extends GenerateClientOptions>(config: T): T => config;
