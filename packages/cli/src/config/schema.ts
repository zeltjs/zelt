// packages/cli/src/config/schema.ts
import * as v from 'valibot';

import type { ZeltPlugin } from '../plugin/types';

const BuildConfigSchema = v.object({
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
  entry: v.optional(v.string()),
  plugins: v.optional(v.array(v.any())),
  build: v.optional(BuildConfigSchema),
  dev: v.optional(DevConfigSchema),
  cli: v.optional(CliConfigSchema),
});

export type ZeltConfig = v.InferOutput<typeof ZeltConfigSchema> & {
  readonly plugins?: readonly ZeltPlugin[];
};
export type BuildConfig = v.InferOutput<typeof BuildConfigSchema>;
export type DevConfig = v.InferOutput<typeof DevConfigSchema>;
export type CliConfig = v.InferOutput<typeof CliConfigSchema>;
