import type { InspectorModel, MapModel, ViewportCommand } from './display.types';
import type { InspectorTab, ScopeMode } from './state.types';

export interface ToolbarModel {
  readonly projectName: string;
  readonly query: string;
  readonly searchCount: number;
  readonly results: readonly {
    readonly id: string;
    readonly label: string;
    readonly hint: string;
  }[];
}
export interface ControlsModel {
  readonly mode: ScopeMode;
  readonly locked: boolean;
  readonly canLock: boolean;
  readonly scopeStatus: string;
  readonly options: { readonly showTypes: boolean; readonly showCounts: boolean };
  readonly columns: readonly {
    readonly id: string;
    readonly label: string;
    readonly visible: boolean;
  }[];
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
  readonly help: boolean;
  readonly notice: string | null;
  readonly declarationCount: number;
  readonly groupCount: number;
}
export type RootModel =
  | { phase: 'loading' }
  | { phase: 'error'; readonly message: string }
  | ReadyModel;
