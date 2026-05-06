import { config } from 'dotenv';

let loaded = false;

export const isEnvLoaded = (): boolean => loaded;

export const markEnvLoaded = (): void => {
  loaded = true;
};

export const loadEnvFiles = (paths: string[]): void => {
  for (const path of paths) {
    config({ path, override: true });
  }
};
