// boolean flag の load/save パターンが複数の設定項目で重複するため、
// 破損データ時のフォールバックと警告メッセージの組み立てだけ共通化する
const loadBooleanFlag = (key: string, defaultValue: boolean, label: string): boolean => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'boolean') {
      console.warn(`zelt studio: saved ${label} flag has an unexpected shape, ignoring`);
      return defaultValue;
    }
    return parsed;
  } catch (error) {
    // 破損データで UI を落とさないが、設定が消えた原因を追えるよう痕跡は残す
    console.warn(`zelt studio: failed to load ${label} flag`, error);
    return defaultValue;
  }
};

const saveBooleanFlag = (key: string, value: boolean): void => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

const hideNodeModulesKey = (): string => `zelt-studio:hide-node-modules:${window.location.host}`;

export const loadHideNodeModules = (): boolean =>
  loadBooleanFlag(hideNodeModulesKey(), false, 'hide-node-modules');

export const saveHideNodeModules = (value: boolean): void =>
  saveBooleanFlag(hideNodeModulesKey(), value);

const groupByFolderKey = (): string => `zelt-studio:group-by-folder:${window.location.host}`;

// フォルダグルーピングは既存の主要な表示モードのため、デフォルトは現行挙動を維持する true
export const loadGroupByFolder = (): boolean =>
  loadBooleanFlag(groupByFolderKey(), true, 'group-by-folder');

export const saveGroupByFolder = (value: boolean): void =>
  saveBooleanFlag(groupByFolderKey(), value);
