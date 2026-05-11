import type { ConfigClass } from '../../config';
import type { Module, ReadyContext } from '../module';

type AnyConstructorClass = new (...args: never[]) => object;

export type ConfigModule = Module & {
  addFallbackConfig: (config: ConfigClass<object>) => void;
  overrideConfig: (config: ConfigClass<object>) => void;
  getDefaults: () => readonly AnyConstructorClass[];
  getOverrides: () => readonly AnyConstructorClass[];
};

type ConfigModuleState = {
  readonly defaults: AnyConstructorClass[];
  readonly overrides: AnyConstructorClass[];
  isReady: boolean;
  isDisposed: boolean;
};

const createState = (): ConfigModuleState => ({
  defaults: [],
  overrides: [],
  isReady: false,
  isDisposed: false,
});

const assertNotDisposed = (state: ConfigModuleState, operation: string): void => {
  if (state.isDisposed) {
    throw new Error(`Cannot ${operation}() after shutdown()`);
  }
};

const assertNotReady = (state: ConfigModuleState, operation: string): void => {
  if (state.isReady) {
    throw new Error(`Cannot ${operation}() after ready()`);
  }
};

export const createConfigModule = (): ConfigModule => {
  const state = createState();

  const setup = (): void => {
    // config module has no setup logic
  };

  const ready = async (_context: ReadyContext): Promise<void> => {
    assertNotDisposed(state, 'ready');
    state.isReady = true;
  };

  const shutdown = async (): Promise<void> => {
    state.isDisposed = true;
  };

  const addFallbackConfig = (config: ConfigClass<object>): void => {
    assertNotDisposed(state, 'addFallbackConfig');
    assertNotReady(state, 'addFallbackConfig');
    state.defaults.push(config);
  };

  const overrideConfig = (config: ConfigClass<object>): void => {
    assertNotDisposed(state, 'overrideConfig');
    assertNotReady(state, 'overrideConfig');
    state.overrides.push(config);
  };

  const getDefaults = (): readonly AnyConstructorClass[] => state.defaults;
  const getOverrides = (): readonly AnyConstructorClass[] => state.overrides;

  return {
    setup,
    ready,
    shutdown,
    addFallbackConfig,
    overrideConfig,
    getDefaults,
    getOverrides,
  };
};
