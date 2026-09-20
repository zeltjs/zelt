import type { Graph } from './graph.lib';
import type { EntryPoint } from './snapshot.types';

export type ScopeMode = 'near' | 'flow' | 'all';
export type InspectorTab = 'contract' | 'source';
export type EntryKind = EntryPoint['kind'] | 'all';
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}
export interface Viewport {
  readonly zoom: number;
  readonly rect: Rect;
}
export interface ViewOptions {
  readonly showTypes: boolean;
  readonly showCounts: boolean;
  readonly showConfig: boolean;
}
export type Scope =
  | { kind: 'following'; readonly mode: ScopeMode }
  | { kind: 'locked'; readonly mode: ScopeMode; readonly anchor: string };
export interface ViewState {
  readonly node: string | null;
  readonly scope: Scope;
  readonly tab: InspectorTab;
  readonly expanded: readonly string[];
  readonly options: ViewOptions;
  readonly query: string;
  readonly category: EntryKind;
  readonly demo: string | null;
}
export type Dialog =
  | { kind: 'composition' }
  | { kind: 'relations'; readonly groupId: string; readonly relationIds: readonly string[] }
  | null;
export interface HistoryItem {
  readonly view: ViewState;
  readonly viewport: Viewport;
}
export type MapCommand =
  | { readonly sequence: number; kind: 'locate'; readonly id: string }
  | { readonly sequence: number; kind: 'restore'; readonly viewport: Viewport }
  | { readonly sequence: number; kind: 'reset' };
export interface ReadyState {
  phase: 'ready';
  readonly requestId: number;
  readonly graph: Graph;
  readonly view: ViewState;
  readonly dialog: Dialog;
  readonly help: boolean;
  readonly history: readonly HistoryItem[];
  readonly viewport: Viewport;
  readonly command: MapCommand | null;
  readonly notice: string | null;
}
export type StudioState =
  | { phase: 'loading'; readonly requestId: number }
  | { phase: 'error'; readonly requestId: number; readonly message: string }
  | ReadyState;
export interface UrlState {
  readonly node: string | null;
  readonly root: string | null;
  readonly mode: ScopeMode;
  readonly tab: InspectorTab;
}
