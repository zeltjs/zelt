import type { StackTrace } from './trace.lib';

// =============================================================================
// Public Types (no trace exposure)
// =============================================================================

export type MethodMeta = {
  readonly name: string | symbol;
  readonly props: readonly object[];
};

export type PropertyMeta = {
  readonly name: string | symbol;
  readonly props: readonly object[];
};

export type ClassMeta = {
  readonly props: readonly object[];
  readonly methods: readonly MethodMeta[];
  readonly properties: readonly PropertyMeta[];
};

// =============================================================================
// Internal Types (with trace for inspect module)
// =============================================================================

// `trace` は「このメンバーの代表位置」(get-type-metadata.lib.ts が使う、既存の意味を
// 維持)であり、同じメンバーに複数 decorator が適用された場合は最初に記録された1件の
// trace しか残らない。一方 `propTraces` は `props` と同じ添字で対応する、decorator
// 適用ごとの trace(1件も欠落・collapse させない)。studio の applies-middleware の
// ように「このメソッドの N 個目の decorator 適用が実際にソース上どこで書かれたか」を
// 個別に知りたい呼び出し元(get-decorator-application-position.lib.ts)のために追加した
type InternalMethodMeta = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
  readonly propTraces: readonly (StackTrace | undefined)[];
};

type InternalPropertyMeta = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

type InternalClassMeta = {
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
  // クラスレベル decorator 版の propTraces(InternalMethodMeta と同じ理由)
  readonly propTraces: readonly (StackTrace | undefined)[];
  readonly methods: readonly InternalMethodMeta[];
  readonly properties: readonly InternalPropertyMeta[];
};

type MemberRecord = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: object;
};

// Storage: final metadata (internal, with trace)
const classStore = new WeakMap<object, InternalClassMeta>();

// Records: temporary storage for members before class is finalized
const methodRecords = new WeakMap<object, MemberRecord[]>();
const propertyRecords = new WeakMap<object, MemberRecord[]>();

const emptyMeta = (): InternalClassMeta => ({
  trace: undefined,
  props: [],
  propTraces: [],
  methods: [],
  properties: [],
});

// --- Record functions (member responsibility) ---

export const recordMethod = (
  classKey: object,
  name: string | symbol,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const list = methodRecords.get(classKey) ?? [];
  methodRecords.set(classKey, [...list, { name, trace, props }]);
};

export const recordProperty = (
  classKey: object,
  name: string | symbol,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const list = propertyRecords.get(classKey) ?? [];
  propertyRecords.set(classKey, [...list, { name, trace, props }]);
};

export const recordClass = (cls: object, trace: StackTrace | undefined, props: object): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    trace: existing.trace ?? trace,
    props: [...existing.props, props],
    propTraces: [...existing.propTraces, trace],
    methods: existing.methods,
    properties: existing.properties,
  });
};

// --- Aggregate function (class additional responsibility) ---

const upsertMethod = (
  methods: readonly InternalMethodMeta[],
  record: MemberRecord,
): readonly InternalMethodMeta[] => {
  const existing = methods.find((m) => m.name === record.name);
  if (!existing) {
    return [
      ...methods,
      { name: record.name, trace: record.trace, props: [record.props], propTraces: [record.trace] },
    ];
  }
  const updated: InternalMethodMeta = {
    name: existing.name,
    trace: existing.trace ?? record.trace,
    props: [...existing.props, record.props],
    propTraces: [...existing.propTraces, record.trace],
  };
  return methods.map((m) => (m === existing ? updated : m));
};

const upsertProperty = (
  properties: readonly InternalPropertyMeta[],
  record: MemberRecord,
): readonly InternalPropertyMeta[] => {
  const existing = properties.find((p) => p.name === record.name);
  if (!existing) {
    return [...properties, { name: record.name, trace: record.trace, props: [record.props] }];
  }
  const updated: InternalPropertyMeta = {
    name: existing.name,
    trace: existing.trace ?? record.trace,
    props: [...existing.props, record.props],
  };
  return properties.map((p) => (p === existing ? updated : p));
};

export const aggregateMembers = (cls: object, classKey: object): void => {
  const existing = classStore.get(cls) ?? emptyMeta();

  let methods = existing.methods;
  for (const record of methodRecords.get(classKey) ?? []) {
    methods = upsertMethod(methods, record);
  }

  let properties = existing.properties;
  for (const record of propertyRecords.get(classKey) ?? []) {
    properties = upsertProperty(properties, record);
  }

  classStore.set(cls, {
    trace: existing.trace,
    props: existing.props,
    propTraces: existing.propTraces,
    methods,
    properties,
  });

  methodRecords.delete(classKey);
  propertyRecords.delete(classKey);
};

// --- Query (public) ---

const toPublicMethodMeta = (m: InternalMethodMeta): MethodMeta => ({
  name: m.name,
  props: m.props,
});

const toPublicPropertyMeta = (p: InternalPropertyMeta): PropertyMeta => ({
  name: p.name,
  props: p.props,
});

const toPublicClassMeta = (internal: InternalClassMeta): ClassMeta => ({
  props: internal.props,
  methods: internal.methods.map(toPublicMethodMeta),
  properties: internal.properties.map(toPublicPropertyMeta),
});

export const getClassMetadata = (cls: object): ClassMeta | undefined => {
  const internal = classStore.get(cls);
  return internal ? toPublicClassMeta(internal) : undefined;
};

// --- Internal Query (for inspect module) ---

export const getInternalClassMetadata = (cls: object): InternalClassMeta | undefined =>
  classStore.get(cls);

export const ensureClassMeta = (cls: object, trace: StackTrace): void => {
  const existing = classStore.get(cls);
  if (existing?.trace) return;
  const base = existing ?? emptyMeta();
  classStore.set(cls, {
    trace,
    props: base.props,
    propTraces: base.propTraces,
    methods: base.methods,
    properties: base.properties,
  });
};
