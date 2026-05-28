import type { ZeltConfig } from './config.types';

export const defineConfig = <T extends ZeltConfig>(config: T): T => config;
