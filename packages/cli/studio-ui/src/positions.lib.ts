import type { SavedPositions } from './graph-to-flow.lib';

export type PositionScope = 'grouped' | 'flat';

// grouped の座標は親（グループ）相対、flat は絶対座標で意味が異なり混在させられないため
// scope ごとに key を分ける。grouped 側は既存 key を維持し、ユーザーの現在の手動配置を壊さない
const storageKey = (scope: PositionScope): string =>
  scope === 'grouped'
    ? `zelt-studio:positions:v2:${window.location.host}`
    : `zelt-studio:positions:v2:flat:${window.location.host}`;

const isPointShape = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { x: unknown }).x === 'number' &&
  typeof (value as { y: unknown }).y === 'number';

// JSON.parse は型不整合なデータ（他バージョンが書いた形式・手編集ミス等）を
// そのまま通すため、graphToFlow まで壊れた形状を流さないよう構造を確認する
const isSavedPositionsShape = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && Object.values(value).every(isPointShape);

export const loadPositions = (scope: PositionScope): SavedPositions => {
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
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

export const savePosition = (
  scope: PositionScope,
  id: string,
  position: { x: number; y: number },
): void => {
  const next = { ...loadPositions(scope), [id]: position };
  window.localStorage.setItem(storageKey(scope), JSON.stringify(next));
};
