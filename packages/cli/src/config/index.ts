export { isZeltConfigLoadError, ZeltConfigLoadError } from '../cli.errors';
export type {
  AppLoader,
  BuildConfig,
  BuildTimeView,
  CliConfig,
  DevConfig,
  ZeltConfig,
} from './config.types';
export { type LoadConfigOptions, loadZeltConfig } from './config-loader.lib';
export { defineConfig } from './define-config.lib';
