import * as v from 'valibot';

const BuildConfigSchema = v.object({
  command: v.optional(v.string()),
  entry: v.optional(v.string()),
  outDir: v.optional(v.string()),
  platform: v.optional(v.picklist(['node', 'browser', 'neutral'])),
  format: v.optional(v.picklist(['esm', 'cjs'])),
  external: v.optional(v.boolean()),
});

const DevConfigSchema = v.object({
  entry: v.optional(v.string()),
  port: v.optional(v.number()),
  watch: v.optional(v.array(v.string())),
  ignore: v.optional(v.array(v.string())),
  debounceMs: v.optional(v.number()),
});

const CliConfigSchema = v.object({
  entry: v.optional(v.string()),
});

export const ZeltConfigSchema = v.object({
  app: v.any(),
  plugins: v.optional(v.array(v.any())),
  build: v.optional(BuildConfigSchema),
  dev: v.optional(DevConfigSchema),
  cli: v.optional(CliConfigSchema),
});

export type AppLoader<TApp extends object = object> = () => TApp | Promise<TApp>;

type RuntimeCapable = {
  readonly createRuntime: (...args: never[]) => unknown;
};

export type BuildTimeView<TApp extends object> = TApp extends RuntimeCapable
  ? Omit<TApp, 'createRuntime'>
  : TApp;

export type ZeltPlugin<TStaticApp extends object = object> = {
  readonly name: string;
  readonly preBuild?: (context: BuildContext<TStaticApp>) => Promise<void>;
  readonly build?: (context: BuildContext<TStaticApp>) => Promise<void>;
  readonly postBuild?: (context: BuildContext<TStaticApp>, result: BuildResult) => Promise<void>;
};

export type BuildContext<TStaticApp extends object = object> = {
  readonly cwd: string;
  readonly build: BuildConfig;
  readonly loadStaticApp: () => Promise<TStaticApp>;
};

export type BuildResult = {
  readonly success: boolean;
};

export type ZeltConfig<TApp extends object = object> = Omit<
  v.InferOutput<typeof ZeltConfigSchema>,
  'app' | 'plugins'
> & {
  readonly app: AppLoader<TApp>;
  readonly plugins?: readonly ZeltPlugin<BuildTimeView<TApp>>[];
};
export type BuildConfig = v.InferOutput<typeof BuildConfigSchema>;
export type DevConfig = v.InferOutput<typeof DevConfigSchema>;
export type CliConfig = v.InferOutput<typeof CliConfigSchema>;
