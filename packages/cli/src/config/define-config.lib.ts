import type { BuildTimeView, ZeltConfig, ZeltPlugin } from './config.types';

export const defineConfig = <
  const TApp extends object,
  const TPlugins extends readonly ZeltPlugin<BuildTimeView<TApp>>[] | undefined = undefined,
>(
  config: Omit<ZeltConfig<TApp>, 'plugins'> & { readonly plugins?: TPlugins },
): Omit<ZeltConfig<TApp>, 'plugins'> & { readonly plugins?: TPlugins } => config;
