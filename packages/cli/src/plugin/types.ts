import type { App, CreateAppOptions } from '@zeltjs/core';

import type { ZeltConfig } from '../config/schema';

export type BuildContext = {
  readonly cwd: string;
  readonly config: ZeltConfig;
  readonly app: App<CreateAppOptions>;
};

export type BuildResult = {
  readonly success: boolean;
};

export type ZeltPlugin = {
  readonly name: string;
  readonly preBuild?: (context: BuildContext) => Promise<void>;
  readonly build?: (context: BuildContext) => Promise<void>;
  readonly postBuild?: (context: BuildContext, result: BuildResult) => Promise<void>;
};
