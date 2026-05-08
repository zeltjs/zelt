/** 空文字を型レベルで禁止 */
export type NonEmptyString<S extends string> = S extends '' ? never : S;

/** undefined を除外した値型 */
export type Defined = {} | null;

/** Top-level driver. namespace で view を取り出すまで data ops は不可。 */
export interface KVDriver {
  namespace<const S extends string>(prefix: NonEmptyString<S>): KVStore;
}

/** atomic 操作対応の driver。namespace の戻り値が AtomicKVStore */
export interface AtomicKVDriver extends KVDriver {
  namespace<const S extends string>(prefix: NonEmptyString<S>): AtomicKVStore;
}

/** namespaced view。実際の data ops はここ */
export interface KVStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /** TTL 延長 (session touch / lock extend 用)。key 不在時は false。 */
  expire(key: string, ttlSec: number): Promise<boolean>;
  /** 子 namespace。チェーン可能。 */
  namespace<const S extends string>(prefix: NonEmptyString<S>): KVStore;
}

/** atomic 操作対応 view */
export interface AtomicKVStore extends KVStore {
  /** atomic incr。最初の incr 時のみ TTL をセット。 */
  incr(key: string, by?: number, opts?: { ttlSec?: number }): Promise<number>;
  /** atomic set if not exists。set されたら true、既存なら false。 */
  setnx<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<boolean>;
  namespace<const S extends string>(prefix: NonEmptyString<S>): AtomicKVStore;
}

export type SetOptions = {
  ttlSec?: number;
};
