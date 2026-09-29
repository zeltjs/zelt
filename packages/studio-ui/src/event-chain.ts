import type { BoundaryHandler, EventSink } from './events.types';

// Each component binds its own boundary to its immediate parent, never to siblings.
export function boundary(parent: EventSink, handle: BoundaryHandler = () => 'pass'): EventSink {
  return (event) => {
    if (handle(event) === 'pass') parent(event);
  };
}
