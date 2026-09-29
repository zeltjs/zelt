import { match, P } from 'ts-pattern';
import type { StudioEvent, ViewIntent } from './events.types';
import { navigate, reference } from './navigation.lib';
import { preferences, presentation } from './preferences.lib';
import { initialReady, restoreUrl, urlState } from './state.lib';
import type { ReadyState, StudioState, UrlState } from './state.types';

export interface UrlEffect {
  type: 'url.write';
  readonly value: UrlState;
}
export interface Transition {
  readonly state: StudioState;
  readonly effects: readonly UrlEffect[];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** @throws {Error} */
function applyIntent(state: ReadyState, event: ViewIntent): ReadyState {
  const clean = { ...state, notice: null };
  const next =
    navigate(clean, event) ??
    reference(clean, event) ??
    preferences(clean, event) ??
    presentation(clean, event);
  if (!next) throw new Error(`Unhandled intent: ${event.type}`);
  return next;
}

/** @throws {Error} */
function readyTransition(state: ReadyState, event: StudioEvent): ReadyState {
  return match(event)
    .with({ type: 'url.restore' }, (e) => restoreUrl(state, e.value))
    .with({ type: 'url.failed' }, (e) => ({ ...state, notice: e.message }))
    .with({ type: 'viewport.observed' }, (e) => ({ ...state, viewport: e.value }))
    .with({ type: P.union('snapshot.loaded', 'snapshot.failed') }, () => state)
    .with({ type: P.union('viewport.pan', 'viewport.zoom') }, (e) => {
      throw new Error(`Unhandled drawing event at Root: ${e.type}`);
    })
    .otherwise((e) => applyIntent(state, e));
}

/** @throws {Error} */
function apply(state: StudioState, event: StudioEvent): StudioState {
  return match(event)
    .returnType<StudioState>()
    .with({ type: 'snapshot.loaded' }, (e) => initialReady(e.graph, e.requestId))
    .with({ type: 'snapshot.failed' }, (e) => ({
      phase: 'error',
      requestId: state.requestId,
      message: e.message,
    }))
    .otherwise((e) => {
      if (state.phase !== 'ready') throw new Error(`操作できません: ${state.phase}`);
      return readyTransition(state, e);
    });
}

function obsolete(state: StudioState, event: StudioEvent): boolean {
  return match(event)
    .with(
      { type: P.union('snapshot.loaded', 'snapshot.failed') },
      (e) => e.requestId !== state.requestId || state.phase !== 'loading',
    )
    .otherwise(() => false);
}

// Invalid requests are visible refusals, never partial changes or substituted graph data.
/** @throws {Error} */
export function transition(state: StudioState, event: StudioEvent): Transition {
  if (event.type === 'viewport.pan' || event.type === 'viewport.zoom')
    throw new Error(`Unhandled drawing event at Root: ${event.type}`);
  if (obsolete(state, event)) return { state, effects: [] };
  try {
    const next = apply(state, event);
    return { state: next, effects: urlEffects(state, next, event) };
  } catch (error) {
    const message = errorMessage(error);
    return {
      state:
        state.phase === 'ready'
          ? { ...state, notice: message }
          : { phase: 'error', requestId: state.requestId, message },
      effects: [],
    };
  }
}

function urlEffects(
  previous: StudioState,
  next: StudioState,
  event: StudioEvent,
): readonly UrlEffect[] {
  if (next.phase !== 'ready' || previous.phase !== 'ready' || event.type === 'url.restore')
    return [];
  const value = urlState(next.view);
  if (event.type === 'view.reset') return [{ type: 'url.write', value }];
  return JSON.stringify(value) === JSON.stringify(urlState(previous.view))
    ? []
    : [{ type: 'url.write', value }];
}
