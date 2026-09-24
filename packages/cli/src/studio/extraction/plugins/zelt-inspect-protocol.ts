import type { InferOutput } from 'valibot';
import { array, literal, nullable, number, object, string, variant } from 'valibot';

/**
 * 子プロセス(Zelt の app を読み込む)と親プロセス(plugin)の間で渡す形。
 * 親は AST を持たないので、ここに出てくる所在は「root からの相対 path と1始まりの行」だけ。
 * schema を正とし、型は InferOutput で作る(付録K)。
 */

// ユーザーコードが stdout に何を書いても区別できるようにマーカー行で渡す
export const ZELT_INSPECT_MARKER = '__ZELT_STUDIO_ZELT__:';

/** runtime が返した class の所在。package 配下なら package 名、そうでなければ root 相対 path で表す */
export const ZeltClassRefSchema = object({
  package: nullable(string()),
  /** package が null のときだけ意味を持つ(root からの相対 path) */
  filePath: string(),
  exportName: string(),
});

/** decorator を書いた位置 */
export const ZeltPositionSchema = object({ filePath: string(), line: number() });

export const ZeltDecoratorTargetSchema = variant('kind', [
  object({ kind: literal('class') }),
  object({ kind: literal('method'), name: string() }),
]);

/** `@UseMiddleware` とそれを包む decorator 1件ぶんの適用 */
export const ZeltMiddlewareUseSchema = object({
  /** middleware class。関数 middleware は null */
  target: nullable(ZeltClassRefSchema),
  on: ZeltDecoratorTargetSchema,
  position: nullable(ZeltPositionSchema),
});

/** `@Authorized` は middleware chain に入るが middleware class を持たない */
export const ZeltAuthorizedSchema = object({
  methodName: string(),
  position: nullable(ZeltPositionSchema),
});

/** constructor の `inject()` 1件 */
export const ZeltDependencySchema = object({
  target: nullable(ZeltClassRefSchema),
  localName: string(),
  line: number(),
});

export const ZeltClassSchema = object({
  ref: ZeltClassRefSchema,
  /** class に付いた decorator 名(Controller・Injectable・Middleware・Config) */
  decorators: array(string()),
  /** extends 先。Config の差し替えを示す */
  base: nullable(ZeltClassRefSchema),
  dependencies: array(ZeltDependencySchema),
  middlewares: array(ZeltMiddlewareUseSchema),
  authorized: array(ZeltAuthorizedSchema),
});

/** blueprint の getMetadata() が持つ route */
export const ZeltRouteSchema = object({
  controller: ZeltClassRefSchema,
  methodName: string(),
  method: string(),
  fullPath: string(),
});

export const ZeltInspectDiagnosticSchema = object({ code: string(), message: string() });

export const ZeltExportRefSchema = object({ filePath: string(), exportName: string() });

export const ZeltInspectionSchema = object({
  applicationId: string(),
  /** config が指した app factory(root 相対) */
  factory: ZeltExportRefSchema,
  /** feature が登録した class と app の configs */
  registered: array(ZeltClassRefSchema),
  /** 全 route の前を通る、app が feature に書いた middleware。登録順 */
  globalMiddlewares: array(ZeltClassRefSchema),
  classes: array(ZeltClassSchema),
  routes: array(ZeltRouteSchema),
  diagnostics: array(ZeltInspectDiagnosticSchema),
});

/** 子プロセスへ渡す入力。argv に JSON で載せる */
export const ZeltInspectRequestSchema = object({
  root: string(),
  applicationId: string(),
  factory: ZeltExportRefSchema,
  tsconfig: string(),
});

export type ZeltClassRef = InferOutput<typeof ZeltClassRefSchema>;
export type ZeltPosition = InferOutput<typeof ZeltPositionSchema>;
export type ZeltMiddlewareUse = InferOutput<typeof ZeltMiddlewareUseSchema>;
export type ZeltAuthorized = InferOutput<typeof ZeltAuthorizedSchema>;
export type ZeltDependency = InferOutput<typeof ZeltDependencySchema>;
export type ZeltClass = InferOutput<typeof ZeltClassSchema>;
export type ZeltRoute = InferOutput<typeof ZeltRouteSchema>;
export type ZeltInspectDiagnostic = InferOutput<typeof ZeltInspectDiagnosticSchema>;
export type ZeltInspection = InferOutput<typeof ZeltInspectionSchema>;
export type ZeltInspectRequest = InferOutput<typeof ZeltInspectRequestSchema>;
