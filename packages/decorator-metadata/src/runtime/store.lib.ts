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
  readonly isStatic: boolean;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
  readonly propTraces: readonly (StackTrace | undefined)[];
};

type InternalPropertyMeta = {
  readonly name: string | symbol;
  readonly isStatic: boolean;
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

// A static and an instance member may share a name, and JavaScript resolves each on its own
// side (the constructor or the prototype), so the side is part of a member's identity.
type MemberRecord = {
  readonly name: string | symbol;
  readonly isStatic: boolean;
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
  isStatic: boolean,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const list = methodRecords.get(classKey) ?? [];
  methodRecords.set(classKey, [...list, { name, isStatic, trace, props }]);
};

export const recordProperty = (
  classKey: object,
  name: string | symbol,
  isStatic: boolean,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const list = propertyRecords.get(classKey) ?? [];
  propertyRecords.set(classKey, [...list, { name, isStatic, trace, props }]);
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

const sameMember = (
  a: { readonly name: string | symbol; readonly isStatic: boolean },
  b: { readonly name: string | symbol; readonly isStatic: boolean },
): boolean => a.name === b.name && a.isStatic === b.isStatic;

const upsertMethod = (
  methods: readonly InternalMethodMeta[],
  record: MemberRecord,
): readonly InternalMethodMeta[] => {
  const existing = methods.find((m) => sameMember(m, record));
  if (!existing) {
    return [
      ...methods,
      {
        name: record.name,
        isStatic: record.isStatic,
        trace: record.trace,
        props: [record.props],
        propTraces: [record.trace],
      },
    ];
  }
  const updated: InternalMethodMeta = {
    name: existing.name,
    isStatic: existing.isStatic,
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
  const existing = properties.find((p) => sameMember(p, record));
  if (!existing) {
    return [
      ...properties,
      { name: record.name, isStatic: record.isStatic, trace: record.trace, props: [record.props] },
    ];
  }
  const updated: InternalPropertyMeta = {
    name: existing.name,
    isStatic: existing.isStatic,
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
  const internal = getInternalClassMetadata(cls);
  return internal ? toPublicClassMeta(internal) : undefined;
};

// --- Internal Query (for inspect module) ---

const objectValue = (value: unknown): object | undefined =>
  (typeof value === 'object' && value !== null) || typeof value === 'function' ? value : undefined;

const ownPrototype = (cls: object): object | undefined =>
  objectValue(Object.getOwnPropertyDescriptor(cls, 'prototype')?.value);

const ownDecoratorMetadata = (cls: object): object | undefined => {
  const metadataSymbol: unknown = Reflect.get(Symbol, 'metadata');
  return objectValue(
    Object.getOwnPropertyDescriptor(
      cls,
      typeof metadataSymbol === 'symbol' ? metadataSymbol : Symbol.for('Symbol.metadata'),
    )?.value,
  );
};

// The side a member lives on: static members are own keys of the constructor, instance
// methods are own keys of the prototype.
const memberHolder = (cls: object, isStatic: boolean): object | undefined =>
  isStatic ? cls : ownPrototype(cls);

const withPendingMembers = (cls: object, base: InternalClassMeta): InternalClassMeta => {
  const keys = [ownPrototype(cls), ownDecoratorMetadata(cls)].filter((key) => key !== undefined);
  const methods = keys
    .flatMap((key) => methodRecords.get(key) ?? [])
    .filter((record) => {
      const holder = memberHolder(cls, record.isStatic);
      return holder !== undefined && Object.getOwnPropertyDescriptor(holder, record.name);
    });
  const properties = keys.flatMap((key) => propertyRecords.get(key) ?? []);
  return {
    ...base,
    methods: methods.reduce(upsertMethod, base.methods),
    properties: properties.reduce(upsertProperty, base.properties),
  };
};

// A class decorator is optional for bases. Their member records remain attached to the
// legacy prototype or TC39 metadata object until a metadata query needs them.
const ownMetadata = (cls: object): InternalClassMeta | undefined => {
  const stored = classStore.get(cls);
  const own = withPendingMembers(cls, stored ?? emptyMeta());
  return stored || own.methods.length > 0 || own.properties.length > 0 ? own : undefined;
};

// A class overrides an inherited method when it redeclares that name on the same side.
const overridesMethod = (cls: object, own: InternalClassMeta) => {
  const holderKeys = (isStatic: boolean): ReadonlySet<string | symbol> => {
    const holder = memberHolder(cls, isStatic);
    return new Set([
      ...(holder ? Reflect.ownKeys(holder) : []),
      ...own.methods.filter((method) => method.isStatic === isStatic).map(({ name }) => name),
      ...own.properties
        .filter((property) => property.isStatic === isStatic)
        .map(({ name }) => name),
    ]);
  };
  const instance = holderKeys(false);
  const statics = holderKeys(true);
  return (member: { readonly name: string | symbol; readonly isStatic: boolean }): boolean =>
    (member.isStatic ? statics : instance).has(member.name);
};

const withInheritedMembers = (
  cls: object,
  own: InternalClassMeta,
  inherited: InternalClassMeta,
): InternalClassMeta => {
  const overridden = overridesMethod(cls, own);
  // A field redeclaration leaves no consistent runtime trace (instance fields never reach the
  // prototype, and transpilers differ on when static fields land), so only a decorated
  // redeclaration replaces an inherited property record.
  const redecorated = (property: InternalPropertyMeta): boolean =>
    own.properties.some((ownProperty) => sameMember(ownProperty, property));
  return {
    ...own,
    methods: [...own.methods, ...inherited.methods.filter((method) => !overridden(method))],
    properties: [
      ...own.properties,
      ...inherited.properties.filter((property) => !redecorated(property)),
    ],
  };
};

// Member lookup follows JavaScript overrides; class annotations belong only to that class.
export const getInternalClassMetadata = (cls: object): InternalClassMeta | undefined => {
  const own = ownMetadata(cls);
  const parent: unknown = Object.getPrototypeOf(cls);
  const inherited = typeof parent === 'function' ? getInternalClassMetadata(parent) : undefined;
  return inherited ? withInheritedMembers(cls, own ?? emptyMeta(), inherited) : own;
};

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
