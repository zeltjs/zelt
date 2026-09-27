import type { Graph } from './graph.lib';
import type {
  InspectorTab,
  Point,
  ScopeMode,
  UrlState,
  ViewOptions,
  Viewport,
} from './state.types';

export type ViewIntent =
  | { type: 'subject.select'; readonly id: string }
  | { type: 'subject.find'; readonly id: string }
  | { type: 'subject.locate'; readonly id: string }
  | { type: 'scope.mode'; readonly mode: ScopeMode }
  | { type: 'scope.lock'; readonly locked: boolean }
  | { type: 'scope.start'; readonly id: string }
  | { type: 'group.toggle'; readonly id: string }
  | { type: 'groups.expand'; readonly expanded: boolean }
  | {
      type: 'options.change';
      readonly options: Pick<ViewOptions, 'showTypes' | 'showCounts'>;
    }
  | { type: 'column.toggle'; readonly id: string; readonly visible: boolean }
  | { type: 'search.change'; readonly query: string }
  | { type: 'inspector.tab'; readonly tab: InspectorTab }
  | { type: 'tag.activate'; readonly key: string }
  | { type: 'reference.back' }
  | { type: 'help.set'; readonly open: boolean }
  | { type: 'view.reset' };
export type ViewEvent =
  | ViewIntent
  | { type: 'viewport.pan'; readonly center: Point }
  | { type: 'viewport.zoom'; readonly value: number | 'fit' }
  | { type: 'viewport.observed'; readonly value: Viewport };
export type EventSink = (event: ViewEvent) => void;
export type BoundaryHandler = (event: ViewEvent) => 'handled' | 'pass';
export type SystemEvent =
  | { type: 'snapshot.loaded'; readonly requestId: number; readonly graph: Graph }
  | { type: 'snapshot.failed'; readonly requestId: number; readonly message: string }
  | { type: 'url.restore'; readonly value: UrlState }
  | { type: 'url.failed'; readonly message: string };
export type StudioEvent = ViewEvent | SystemEvent;
