export { Config } from './config.decorator';
export type { ConfigClass } from './config.types';
export {
  assertNoUnresolvedAbstractConfigs,
  overrideConfig,
  resolveConfig,
} from './config-token.lib';
