import type { ZeltConfig } from '../config/schema';

export type BuildContext = {
  readonly cwd: string;
  readonly config: ZeltConfig;
};

export type ZeltPlugin = {
  readonly name: string;
  readonly preBuild?: (context: BuildContext) => Promise<void>;
};
