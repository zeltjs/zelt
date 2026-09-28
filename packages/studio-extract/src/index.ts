// snapshot の型と schema は core/snapshot-schema.lib.ts が SoT。ブラウザは `./snapshot`
// subpath から同じモジュールを直接読む
export type { StudioSnapshot } from './core';
export { StudioSnapshotSchema } from './core';
export type {
  ExtractionPhase,
  ExtractionResult,
  ExtractOptions,
  PublishResult,
  SnapshotOptions,
  SnapshotResult,
} from './run.lib';
export { extract, extractSnapshot, publish } from './run.lib';
