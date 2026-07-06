import type { SavedPositions } from './graph-to-flow.lib';

const storageKey = (): string => `zelt-studio:positions:${window.location.host}`;

export const loadPositions = (): SavedPositions => {
  try {
    const raw = window.localStorage.getItem(storageKey());
    return raw === null ? {} : (JSON.parse(raw) as SavedPositions);
  } catch (error) {
    // 破損データで UI を落とさないが、手動配置が消えた原因を追えるよう痕跡は残す
    console.warn('zelt studio: failed to load saved positions', error);
    return {};
  }
};

export const savePosition = (id: string, position: { x: number; y: number }): void => {
  const next = { ...loadPositions(), [id]: position };
  window.localStorage.setItem(storageKey(), JSON.stringify(next));
};
