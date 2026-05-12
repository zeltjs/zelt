import type { ESLint } from 'eslint';

import configDiScope from './rules/config-di-scope';
import decoratorFileNaming from './rules/decorator-file-naming';

const plugin: ESLint.Plugin = {
  rules: {
    'config-di-scope': configDiScope,
    'decorator-file-naming': decoratorFileNaming,
  },
};

export default plugin;
