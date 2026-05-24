import type { StackTrace } from './position';

export type MethodMeta = {
  readonly name: string;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

export type PropertyMeta = {
  readonly name: string;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

export type ClassMeta = {
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
  readonly methods: readonly MethodMeta[];
  readonly properties: readonly PropertyMeta[];
};

type MemberRecord = {
  readonly name: string;
  readonly trace: StackTrace | undefined;
  readonly props: object;
};

// Storage: final metadata
const classStore = new WeakMap<object, ClassMeta>();

// Records: temporary storage for members before class is finalized
const methodRecords = new WeakMap<object, MemberRecord[]>();
const propertyRecords = new WeakMap<object, MemberRecord[]>();

const emptyMeta = (): ClassMeta => ({
  trace: undefined,
  props: [],
  methods: [],
  properties: [],
});

// --- Record functions (member responsibility) ---

export const recordMethod = (
  classKey: object,
  name: string,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const list = methodRecords.get(classKey) ?? [];
  methodRecords.set(classKey, [...list, { name, trace, props }]);
};

export const recordProperty = (
  classKey: object,
  name: string,
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
  methods: readonly MethodMeta[],
  record: MemberRecord,
): readonly MethodMeta[] => {
  const existing = methods.find((m) => m.name === record.name);
  if (!existing) {
    return [...methods, { name: record.name, trace: record.trace, props: [record.props] }];
  }
  const updated: MethodMeta = {
    name: existing.name,
    trace: existing.trace ?? record.trace,
    props: [...existing.props, record.props],
  };
  return methods.map((m) => (m === existing ? updated : m));
};

const upsertProperty = (
  properties: readonly PropertyMeta[],
  record: MemberRecord,
): readonly PropertyMeta[] => {
  const existing = properties.find((p) => p.name === record.name);
  if (!existing) {
    return [...properties, { name: record.name, trace: record.trace, props: [record.props] }];
  }
  const updated: PropertyMeta = {
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

// --- Query ---

export const getClassMetadata = (cls: object): ClassMeta | undefined => classStore.get(cls);

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
