// snapshot の型と schema は core/snapshot-schema.lib.ts が SoT。ブラウザは `./snapshot`
// subpath から同じモジュールを直接読む
export type { AnalysisReport, IgnoreRecommendation, StudioSnapshot } from './core';
export { StudioSnapshotSchema } from './core';
export type {
  ExtractionPhase,
  ExtractionResult,
  ExtractOptions,
  PublishResult,
  SnapshotFailure,
  SnapshotJsonResult,
  SnapshotOptions,
  SnapshotResult,
} from './run.lib';
export { extract, extractSnapshot, extractSnapshotJson, publish } from './run.lib';
