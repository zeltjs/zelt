const defineError = <Context extends object>(
  name: string,
  createMessage: (ctx: Context) => string,
) => {
  const toErrorOptions = (cause: unknown): ErrorOptions | undefined =>
    cause === undefined ? undefined : { cause };

  return class ZeltCliError extends Error {
    readonly context: Context;

    constructor(context: Context, cause?: unknown) {
      super(createMessage(context), toErrorOptions(cause));
      this.name = name;
      this.context = context;
    }
  };
};

export const ZeltConfigLoadError = defineError(
  'ZeltConfigLoadError',
  () => 'Failed to load config',
);

export const ZeltBuildError = defineError(
  'ZeltBuildError',
  (ctx: { exitCode: number }) => `Build failed with exit code ${ctx.exitCode}`,
);

export const ZeltBuildCommandConflictError = defineError(
  'ZeltBuildCommandConflictError',
  (ctx: { pluginName: string }) =>
    `Both plugin build hook (${ctx.pluginName}) and build.command are configured. Use only one build implementation.`,
);

export const ZeltNoEntryError = defineError('ZeltNoEntryError', () => 'No entry file specified');

export const ZeltNoCliEntryError = defineError(
  'ZeltNoCliEntryError',
  () => 'No CLI entry specified',
);

export const ZeltCliExecutionError = defineError(
  'ZeltCliExecutionError',
  (ctx: { exitCode: number }) => `CLI execution failed with exit code ${ctx.exitCode}`,
);

export const isZeltConfigLoadError = (
  err: unknown,
): err is InstanceType<typeof ZeltConfigLoadError> => err instanceof ZeltConfigLoadError;

export const isZeltBuildError = (err: unknown): err is InstanceType<typeof ZeltBuildError> =>
  err instanceof ZeltBuildError;

export const isZeltBuildCommandConflictError = (
  err: unknown,
): err is InstanceType<typeof ZeltBuildCommandConflictError> =>
  err instanceof ZeltBuildCommandConflictError;

export const isZeltNoEntryError = (err: unknown): err is InstanceType<typeof ZeltNoEntryError> =>
  err instanceof ZeltNoEntryError;

export const isZeltNoCliEntryError = (
  err: unknown,
): err is InstanceType<typeof ZeltNoCliEntryError> => err instanceof ZeltNoCliEntryError;

export const isZeltCliExecutionError = (
  err: unknown,
): err is InstanceType<typeof ZeltCliExecutionError> => err instanceof ZeltCliExecutionError;

export const ZeltMultipleBuildHooksError = defineError(
  'ZeltMultipleBuildHooksError',
  (ctx: { pluginNames: readonly string[] }) =>
    `Multiple plugins define build hook: ${ctx.pluginNames.join(', ')}. Only one plugin can define a custom build.`,
);

export const isZeltMultipleBuildHooksError = (
  err: unknown,
): err is InstanceType<typeof ZeltMultipleBuildHooksError> =>
  err instanceof ZeltMultipleBuildHooksError;
