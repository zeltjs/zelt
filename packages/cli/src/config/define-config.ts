import type { ZeltConfig } from './schema';

export const defineConfig = <T extends ZeltConfig>(config: T): T => config;
