import type { StackTrace } from './position';

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

type InternalMethodMeta = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

type InternalPropertyMeta = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

type InternalClassMeta = {
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
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
    return [...methods, { name: record.name, trace: record.trace, props: [record.props] }];
  }
  const updated: InternalMethodMeta = {
    name: existing.name,
    trace: existing.trace ?? record.trace,
    props: [...existing.props, record.props],
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
    methods: base.methods,
    properties: base.properties,
  });
};
