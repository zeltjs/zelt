import type { DialogModel, InspectorModel, MapModel, ViewportCommand } from './display.types';
import type { EntryKind, InspectorTab, ScopeMode, ViewOptions } from './state.types';

export interface ToolbarModel {
  readonly projectName: string;
  readonly query: string;
  readonly category: EntryKind;
  readonly searchCount: number;
  readonly results: readonly {
    readonly id: string;
    readonly label: string;
    readonly hint: string;
  }[];
  readonly entries: readonly {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
  }[];
  readonly origin: string;
}
export interface ControlsModel {
  readonly mode: ScopeMode;
  readonly locked: boolean;
  readonly canLock: boolean;
  readonly scopeStatus: string;
  readonly options: ViewOptions;
  readonly canBack: boolean;
}
export interface ReadyModel {
  phase: 'ready';
  readonly toolbar: ToolbarModel;
  readonly controls: ControlsModel;
  readonly graph: MapModel;
  readonly command: ViewportCommand | null;
  readonly inspector: InspectorModel | null;
  readonly tab: InspectorTab;
  readonly dialog: DialogModel | null;
  readonly help: boolean;
  readonly notice: string | null;
  readonly demo: { readonly id: string; readonly label: string; readonly active: boolean } | null;
  readonly declarationCount: number;
  readonly groupCount: number;
}
export type RootModel =
  | { phase: 'loading' }
  | { phase: 'error'; readonly message: string }
  | ReadyModel;
