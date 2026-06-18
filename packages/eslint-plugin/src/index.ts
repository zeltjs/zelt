import type { ESLint } from 'eslint';

import configDiScope from './rules/config-di-scope';
import decoratorFileNaming from './rules/decorator-file-naming';
import doubleDotNaming from './rules/double-dot-naming';
import noGenericErrorConstructor from './rules/no-generic-error-constructor';
import noOverloadCast from './rules/no-overload-cast';

const plugin: ESLint.Plugin = {
  rules: {
    'config-di-scope': configDiScope,
    'decorator-file-naming': decoratorFileNaming,
    'double-dot-naming': doubleDotNaming,
    'no-generic-error-constructor': noGenericErrorConstructor,
    'no-overload-cast': noOverloadCast,
  },
};

export default plugin;
