import type { SourceFacts } from './core-facts.types';
import type { ResolvedConfig } from './extract-config.lib';
import type { AnalysisReport, Material, ProviderId, Span } from './plugin.types';
import type {
  GrantedRelation,
  Hint,
  Meaning,
  SetupItem,
  StudioSnapshot,
} from './snapshot-schema.lib';

export type PluginContribution = {
  readonly id: ProviderId;
  readonly materials: readonly Material[];
  readonly reports: readonly AnalysisReport[];
};

export type AssemblyInput = {
  readonly config: ResolvedConfig;
  readonly facts: SourceFacts;
  readonly plugins: readonly PluginContribution[];
  /** original text of a span; plugin materials carry offsets, not text */
  readonly readSpan: (span: Span) => string;
  /** false は段階実装用。未実装 plugin の required を止めずに配信する */
  readonly enforceRequired?: boolean;
};

export type AssemblyFailure = { readonly code: string; readonly message: string };

export type AssemblyResult =
  | { ok: true; readonly snapshot: StudioSnapshot }
  | { ok: false; readonly failures: readonly AssemblyFailure[] };

/** plugin が主題ごとに足した値の置き場。配信時に並べ替えて宣言・groupへ移す */
export type Bucket = {
  meanings: Meaning[];
  hints: Hint[];
  setup: SetupItem[];
  granted: GrantedRelation[];
};
