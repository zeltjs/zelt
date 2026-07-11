const storageKey = (): string => `zelt-studio:hide-node-modules:${window.location.host}`;

export const loadHideNodeModules = (): boolean => {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'boolean') {
      console.warn('zelt studio: saved hide-node-modules flag has an unexpected shape, ignoring');
      return false;
    }
    return parsed;
  } catch (error) {
    // 破損データで UI を落とさないが、設定が消えた原因を追えるよう痕跡は残す
    console.warn('zelt studio: failed to load hide-node-modules flag', error);
    return false;
  }
};

export const saveHideNodeModules = (value: boolean): void => {
  window.localStorage.setItem(storageKey(), JSON.stringify(value));
};
