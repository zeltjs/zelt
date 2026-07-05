export type HonoClientGenerationErrorContext = {
  readonly reason:
    | 'local_reference_leaked'
    | 'program_creation_failed'
    | 'source_emit_failed'
    | 'tsconfig_error'
    | 'type_not_found'
    | 'type_resolution_failed';
  readonly details: string;
};

export class ZeltHonoClientGenerationError extends Error {
  readonly context: HonoClientGenerationErrorContext;

  constructor(context: HonoClientGenerationErrorContext, cause?: unknown) {
    super(`Hono client generation failed: ${context.reason} - ${context.details}`, { cause });
    this.name = 'ZeltHonoClientGenerationError';
    this.context = context;
  }
}
