import type { SavedPositions } from './graph-to-flow.lib';

const storageKey = (): string => `zelt-studio:positions:${window.location.host}`;

const isPointShape = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { x: unknown }).x === 'number' &&
  typeof (value as { y: unknown }).y === 'number';

// JSON.parse は型不整合なデータ（他バージョンが書いた形式・手編集ミス等）を
// そのまま通すため、graphToFlow まで壊れた形状を流さないよう構造を確認する
const isSavedPositionsShape = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && Object.values(value).every(isPointShape);

export const loadPositions = (): SavedPositions => {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isSavedPositionsShape(parsed)) {
      console.warn('zelt studio: saved positions have an unexpected shape, ignoring');
      return {};
    }
    return parsed as SavedPositions;
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
