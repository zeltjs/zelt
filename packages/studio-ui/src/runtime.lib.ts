import type { EventSink, StudioEvent } from './events.types';
import { readGraph } from './graph.lib';
import type { UrlEffect } from './mediator.lib';
import { errorMessage, transition } from './mediator.lib';
import { present } from './presenter.lib';
import type { RootModel } from './presenter.types';
import type { StudioState } from './state.types';
import { decodeUrl, encodeUrl } from './url.lib';

export interface RuntimePorts {
  readonly render: (model: RootModel, emit: EventSink) => void;
  readonly fetchSnapshot: (signal: AbortSignal) => Promise<unknown>;
  readonly readUrl: () => string;
  readonly writeUrl: (url: string) => void;
  readonly onPopState: (restore: () => void) => () => void;
}

// IO is outside the state machine; Views receive only projected data and a parent sink.
/** @throws {Error} */
export function mountStudio(ports: RuntimePorts): () => void {
  let state: StudioState = { phase: 'loading', requestId: 1 };
  const controller = new AbortController();
  /** @throws {Error} */
  function dispatch(event: StudioEvent): void {
    const result = transition(state, event);
    state = result.state;
    ports.render(present(state), dispatch);
    for (const effect of result.effects) write(effect);
  }
  /** @throws {Error} */
  function write(effect: UrlEffect): void {
    try {
      ports.writeUrl(encodeUrl(ports.readUrl(), effect.value));
    } catch (error) {
      dispatch({ type: 'url.failed', message: `URL保存失敗: ${errorMessage(error)}` });
    }
  }
  /** @throws {Error} */
  function restore(): void {
    try {
      dispatch({ type: 'url.restore', value: decodeUrl(ports.readUrl()) });
    } catch (error) {
      dispatch({ type: 'url.failed', message: `URL復元失敗: ${errorMessage(error)}` });
    }
  }
  ports.render(present(state), dispatch);
  const unsubscribe = ports.onPopState(() => {
    if (state.phase === 'ready') restore();
  });
  void loadSnapshot(ports, controller.signal, dispatch, restore);
  return () => {
    controller.abort();
    unsubscribe();
  };
}

/** @throws {Error} */
async function loadSnapshot(
  ports: RuntimePorts,
  signal: AbortSignal,
  dispatch: (event: StudioEvent) => void,
  restore: () => void,
): Promise<void> {
  try {
    const input = await ports.fetchSnapshot(signal);
    if (signal.aborted) return;
    const graph = readGraph(input);
    dispatch({ type: 'snapshot.loaded', requestId: 1, graph });
    restore();
  } catch (error) {
    if (signal.aborted) return;
    dispatch({ type: 'snapshot.failed', requestId: 1, message: errorMessage(error) });
  }
}
