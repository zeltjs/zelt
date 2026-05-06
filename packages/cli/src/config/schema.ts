import * as v from 'valibot';

const OpenApiConfigSchema = v.object({
  controllers: v.optional(v.array(v.string())),
  outDir: v.optional(v.string()),
  tsconfig: v.optional(v.string()),
});

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

export const ZeltConfigSchema = v.object({
  openapi: v.optional(OpenApiConfigSchema),
  build: v.optional(BuildConfigSchema),
  dev: v.optional(DevConfigSchema),

  // Legacy top-level fields for backward compatibility
  controllers: v.optional(v.array(v.string())),
  dist: v.optional(v.string()),
  tsconfig: v.optional(v.string()),
});

export type ZeltConfig = v.InferOutput<typeof ZeltConfigSchema>;
export type BuildConfig = v.InferOutput<typeof BuildConfigSchema>;
export type DevConfig = v.InferOutput<typeof DevConfigSchema>;
export type OpenApiConfig = v.InferOutput<typeof OpenApiConfigSchema>;
