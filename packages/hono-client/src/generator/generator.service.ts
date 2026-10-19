import { Injectable, ZeltDecoratorUsageError } from '@zeltjs/core';
import { describeControllerSourceError, resolveControllerSources } from './controller-sources.lib';
import { emitAppType } from './emit.lib';
import { ZeltHonoClientGenerationError } from './generator.errors';
import type { GenerateOptions, HttpAppLike } from './generator.types';
import type { PortableEmitError } from './portable-app-type-emitter.service';
import { PortableAppTypeEmitterService } from './portable-app-type-emitter.service';

@Injectable()
export class GeneratorService {
  private readonly portableEmitter = new PortableAppTypeEmitterService();

  /** @throws {ZeltDecoratorUsageError | ZeltHonoClientGenerationError} */
  async generateFromApp(app: HttpAppLike, options: GenerateOptions): Promise<string> {
    const base = {
      metadata: app.getMetadata(),
      controllers: app.getControllers(),
      distDir: options.distDir,
      ...(options.loadModule ? { loadModule: options.loadModule } : {}),
    };

    if (!options.portable) {
      const sources = await resolveControllerSources(base);
      if (!sources.ok) {
        const error = sources.error;
        if (error.kind === 'controller_missing') {
          throw new ZeltDecoratorUsageError({
            decoratorName: 'Controller',
            reason: 'missing_decorator',
            targetName: error.name,
          });
        }
        throw new ZeltHonoClientGenerationError({
          reason: 'source_emit_failed',
          details: describeControllerSourceError(error),
        });
      }
      return emitAppType({ distDir: options.distDir, controllers: sources.value });
    }

    const result = await this.portableEmitter.emit({
      ...base,
      tsconfig: options.tsconfig,
      projectRoot: options.projectRoot,
    });

    if (!result.ok) {
      const error = result.error;
      throw new ZeltHonoClientGenerationError(
        { reason: error.kind, details: this.portableErrorDetail(error) },
        this.portableErrorCause(error),
      );
    }

    return result.value;
  }

  private portableErrorDetail(error: PortableEmitError): string {
    if (error.kind === 'type_not_found') return error.typeName;
    if (error.kind === 'local_reference_leaked') return error.reference;
    return error.message;
  }

  private portableErrorCause(error: PortableEmitError): unknown {
    if (error.kind === 'source_emit_failed') return error.cause;
    if (error.kind === 'tsconfig_error') return error.cause;
    return undefined;
  }
}
