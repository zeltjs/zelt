import type { RelationKind, SourceDetail } from './snapshot.types';
import type { Rect, Viewport } from './state.types';

export interface VisualState {
  readonly dimmed: boolean;
  readonly selected: boolean;
  readonly changed: boolean;
}
export interface DeclarationModel extends VisualState {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly callable: boolean;
  readonly hint: string;
  readonly top: number;
}
export interface TagModel {
  readonly key: string;
  readonly kind: string;
  readonly label: string;
  readonly title: string;
  readonly dimmed: boolean;
}
export interface GroupModel extends VisualState {
  readonly id: string;
  readonly kind: string;
  readonly rect: Rect;
  readonly expanded: boolean;
  readonly members: readonly DeclarationModel[];
  readonly tags: readonly TagModel[];
}
export interface EdgeModel {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly kind: RelationKind;
  readonly ids: readonly string[];
  readonly path: string;
  readonly title: string;
  readonly count: { readonly text: string; readonly x: number; readonly y: number } | null;
}
export interface MapModel {
  readonly width: number;
  readonly height: number;
  readonly columns: readonly {
    readonly label: string;
    readonly x: number;
    readonly width: number;
  }[];
  readonly groups: readonly GroupModel[];
  readonly edges: readonly EdgeModel[];
  readonly summary: string;
  readonly lineCount: string;
  readonly configHidden: boolean;
}
export type ViewportCommand =
  | { readonly sequence: number; kind: 'locate'; readonly rect: Rect }
  | { readonly sequence: number; kind: 'restore'; readonly viewport: Viewport }
  | { readonly sequence: number; kind: 'reset' };
export interface UnitRow {
  readonly key: string;
  readonly name: string;
  readonly target: string;
  readonly targetLabel: string;
  readonly title: string;
  readonly style: string;
  readonly mocks: string;
}
export interface EndpointModel {
  readonly id: string;
  readonly label: string;
  readonly coverage: string;
  readonly rows: readonly {
    readonly id: string;
    readonly name: string;
    readonly suite: string;
    readonly source: string;
    readonly title: string;
  }[];
}
export interface InspectorModel {
  readonly id: string;
  readonly kind: string;
  readonly path: string;
  readonly source: SourceDetail;
  readonly members: readonly { readonly id: string; readonly label: string }[];
  readonly unit: {
    readonly rows: readonly UnitRow[];
    readonly showTarget: boolean;
    readonly coverage: string;
  };
  readonly endpoints: readonly EndpointModel[];
  readonly canUseAsRoot: boolean;
  readonly locateLabel: string;
  readonly sourceNotice: string | null;
}
export interface DialogModel {
  readonly title: string;
  readonly description: string;
  readonly compositionSource: boolean;
  readonly rows: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly label: string;
  }[];
}
