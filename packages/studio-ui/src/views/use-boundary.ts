import { useMemo } from 'react';
import { boundary } from '../event-chain';
import type { BoundaryHandler, EventSink } from '../events.types';

export function useBoundary(parent: EventSink, handle?: BoundaryHandler): EventSink {
  return useMemo(() => boundary(parent, handle), [parent, handle]);
}
