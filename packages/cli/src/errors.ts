import { defineError } from '@zeltjs/core/internal-bridge/errors';

export const ZeltConfigLoadError = defineError(
  'ZeltConfigLoadError',
  () => 'Failed to load config',
);

export const ZeltBuildError = defineError(
  'ZeltBuildError',
  (ctx: { exitCode: number }) => `Build failed with exit code ${ctx.exitCode}`,
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

export const isZeltNoEntryError = (err: unknown): err is InstanceType<typeof ZeltNoEntryError> =>
  err instanceof ZeltNoEntryError;

export const isZeltNoCliEntryError = (
  err: unknown,
): err is InstanceType<typeof ZeltNoCliEntryError> => err instanceof ZeltNoCliEntryError;

export const isZeltCliExecutionError = (
  err: unknown,
): err is InstanceType<typeof ZeltCliExecutionError> => err instanceof ZeltCliExecutionError;
