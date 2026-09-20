import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ViewportCommand } from '../display.types';
import type { BoundaryHandler, EventSink } from '../events.types';
import type { Point, Viewport } from '../state.types';

const emptyViewport: Viewport = { zoom: 1, rect: { x: 0, y: 0, width: 0, height: 0 } };
export function useViewport(width: number, command: ViewportCommand | null, emit: EventSink) {
  const element = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1),
    pending = useRef<Point | null>(null);
  const { view, measure } = useMeasurement(element, zoomRef, emit);
  const changeZoom = useCallback(
    (value: number | 'fit') => {
      const el = element.current;
      if (!el) return;
      const next = Math.max(
        0.15,
        Math.min(1.4, value === 'fit' ? (el.clientWidth - 20) / width : value),
      );
      pending.current = {
        x: ((el.scrollLeft + el.clientWidth / 2) / zoomRef.current) * next - el.clientWidth / 2,
        y: ((el.scrollTop + el.clientHeight / 2) / zoomRef.current) * next - el.clientHeight / 2,
      };
      zoomRef.current = next;
      setZoom(next);
    },
    [width],
  );
  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    if (pending.current) {
      el.scrollTo(pending.current.x, pending.current.y);
      pending.current = null;
    }
    measure();
  });
  useInitialFit(element, width, changeZoom, measure);
  useViewportCommand(command, element, zoomRef, pending, changeZoom, measure);
  const handle: BoundaryHandler = useCallback(
    (event) => {
      if (event.type === 'viewport.zoom') {
        changeZoom(event.value);
        return 'handled';
      }
      if (event.type !== 'viewport.pan') return 'pass';
      element.current?.scrollTo(event.center.x * zoomRef.current, event.center.y * zoomRef.current);
      measure();
      return 'handled';
    },
    [changeZoom, measure],
  );
  return { element, zoom, viewport: view.rect, measure, handle };
}

function useViewportCommand(
  command: ViewportCommand | null,
  element: { readonly current: HTMLElement | null },
  zoom: { readonly current: number },
  pending: { current: Point | null },
  changeZoom: (value: number | 'fit') => void,
  measure: () => void,
) {
  const applied = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (command === null || command.sequence === applied.current) return;
    const el = element.current;
    if (!el) return;
    applied.current = command.sequence;
    if (command.kind === 'locate')
      el.scrollTo(
        Math.max(0, (command.rect.x - 50) * zoom.current),
        Math.max(0, (command.rect.y - 80) * zoom.current),
      );
    if (command.kind === 'restore') {
      changeZoom(command.viewport.zoom);
      pending.current = {
        x: command.viewport.rect.x * command.viewport.zoom,
        y: command.viewport.rect.y * command.viewport.zoom,
      };
      el.scrollTo(pending.current.x, pending.current.y);
    }
    if (command.kind === 'reset') {
      changeZoom('fit');
      pending.current = { x: 0, y: 0 };
      el.scrollTo(0, 0);
    }
    measure();
  }, [command, element, zoom, pending, changeZoom, measure]);
}

function useMeasurement(
  element: { readonly current: HTMLElement | null },
  zoomRef: { readonly current: number },
  emit: EventSink,
) {
  const [view, setView] = useState(emptyViewport);
  const previous = useRef('');
  const measure = useCallback(() => {
    const el = element.current;
    if (!el) return;
    const z = zoomRef.current;
    const next = {
      zoom: z,
      rect: {
        x: el.scrollLeft / z,
        y: el.scrollTop / z,
        width: el.clientWidth / z,
        height: el.clientHeight / z,
      },
    };
    const key = JSON.stringify(next);
    if (key === previous.current) return;
    previous.current = key;
    setView(next);
    emit({ type: 'viewport.observed', value: next });
  }, [element, zoomRef, emit]);
  return { view, measure };
}
function useInitialFit(
  element: { readonly current: HTMLElement | null },
  width: number,
  changeZoom: (value: number | 'fit') => void,
  measure: () => void,
) {
  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    changeZoom(el.clientWidth < 600 ? 1 : Math.min(1, (el.clientWidth - 20) / width));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [element, changeZoom, measure, width]);
}
