import type { ClassSource, InspectError, SourceContext } from '@zeltjs/decorator-metadata/inspect';
import { getClassSource } from '@zeltjs/decorator-metadata/inspect';

import type { ControllerClass, ControllerRouteInfo, HttpMetadata } from './generator.types';

export type ControllerWithSource = ControllerRouteInfo & { readonly source: ClassSource };
type ControllerSourceError =
  | { kind: 'controller_missing'; readonly name: string }
  | { kind: 'source_resolution_failed'; readonly name: string; readonly detail: InspectError };
type ControllerSourcesResult =
  | { ok: true; readonly value: readonly ControllerWithSource[] }
  | { ok: false; readonly error: ControllerSourceError };

export const describeControllerSourceError = (error: ControllerSourceError): string =>
  error.kind === 'controller_missing'
    ? `${error.name} is missing @Controller decorator`
    : `${error.name}: ${error.detail.code}: ${error.detail.message}`;

/** Resolve importable identities before rendering TypeScript. */
export const resolveControllerSources = async (
  ctx: SourceContext & {
    readonly metadata: HttpMetadata;
    readonly controllers: readonly ControllerClass[];
  },
): Promise<ControllerSourcesResult> => {
  const sources: ControllerWithSource[] = [];
  for (const info of ctx.metadata.controllers) {
    const cls = ctx.controllers.find((controller) => controller.name === info.name);
    if (!cls)
      return {
        ok: false,
        error: { kind: 'controller_missing', name: info.name },
      };
    const result = await getClassSource(cls, ctx);
    if (result.isErr())
      return {
        ok: false,
        error: { kind: 'source_resolution_failed', name: info.name, detail: result.error },
      };
    sources.push({ ...info, source: result.value });
  }
  return { ok: true, value: sources };
};
